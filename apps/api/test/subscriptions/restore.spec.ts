// Restauration des achats et multi-appareils (F-ABO-03, ADR-040) : les droits suivent le compte ;
// un second appareil du même compte restaure l'achat sans doublon ; le même achat présenté par un
// autre compte est refusé (409) sans changer le titulaire. Plage d'horloge : août 2027.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { subscription, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { PurchaseProof } from '../../src/subscriptions/store-receipt-verifier.js';
import { createTenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { type EntitlementsBody, subscriptionClient } from '../support/subscription-client.js';
import { FakeStoreVerifier } from '../support/subscriptions.js';

describe('restauration des achats (F-ABO-03)', () => {
  const now = Date.UTC(2027, 7, 25, 9, 0, 0);
  const clock = new FakeClock(now);
  const stores = new FakeStoreVerifier();
  const { pool, db } = testDb(4);
  let app: INestApplication;
  const client = subscriptionClient(() => app);

  beforeAll(async () => ({ app } = await startTestApp({ clock, storeVerifier: stores })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  /** Abonnement App Store : la restauration présente une autre transaction du même achat. */
  function appStorePurchase(expiresAt: Date) {
    const originalTransactionId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const answer = (transactionId: string, expires: Date) => {
      const proof: PurchaseProof = { store: 'app_store', transactionId };
      stores.answer(proof, {
        store: 'app_store',
        purchaseKey: originalTransactionId,
        productCode: 'premium_monthly',
        status: 'active',
        expiresAt: expires,
      });
      return proof;
    };
    return { first: answer(`${originalTransactionId}1`, expiresAt), answer };
  }

  it('second appareil du même compte : Premium sans rien faire, restauration sans doublon', async () => {
    const t = await createTenant(app, db, clock.now());
    const month = new Date(now + 30 * 86_400_000);
    const purchase = appStorePurchase(month);
    expect((await client.verify(t.accessToken, purchase.first)).status).toBe(200);

    // Second appareil : nouvelle session du compte, droits déjà visibles.
    const secondDevice = await client.login(t);
    expect(((await client.get(secondDevice)).body as EntitlementsBody).premiumUntil).toBe(
      month.toISOString(),
    );

    // Restauration depuis le second appareil, après renouvellement (transaction plus récente).
    const renewed = new Date(now + 60 * 86_400_000);
    clock.set(now + 1000);
    const restored = await client.verify(secondDevice, purchase.answer('9990001', renewed));
    expect(restored.status).toBe(200);
    expect((restored.body as EntitlementsBody).premiumUntil).toBe(renewed.toISOString());
    const rows = await db.select().from(subscription).where(eq(subscription.userId, t.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ expiresAt: renewed, verifiedAt: new Date(now + 1000) });
    clock.set(now);
  });

  it('achat d’un autre compte → 409, titulaire et échéance inchangés', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    const month = new Date(now + 30 * 86_400_000);
    const purchase = appStorePurchase(month);
    expect((await client.verify(alice.accessToken, purchase.first)).status).toBe(200);

    const stolen = await client.verify(
      bob.accessToken,
      purchase.answer('9990002', new Date(now + 90 * 86_400_000)),
    );
    expect(stolen.status).toBe(409);
    expect(JSON.stringify(stolen.body)).not.toContain(alice.email);
    expect(((await client.get(bob.accessToken)).body as EntitlementsBody).plan).toBe('free');
    expect(await db.select().from(subscription).where(eq(subscription.userId, bob.id))).toEqual([]);
    const [row] = await db.select().from(subscription).where(eq(subscription.userId, alice.id));
    expect(row!.expiresAt).toEqual(month);
  });

  it('achat désigné pour un autre compte (accountRef) → 409 même présenté en premier', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    const purchaseToken = `jeton.${newId()}`;
    const proof: PurchaseProof = { store: 'google_play', purchaseToken };
    stores.answer(proof, {
      store: 'google_play',
      purchaseKey: purchaseToken,
      productCode: 'premium_yearly',
      status: 'active',
      expiresAt: new Date(now + 300 * 86_400_000),
      accountRef: alice.id,
    });
    expect((await client.verify(bob.accessToken, proof)).status).toBe(409);
    expect(await db.select().from(subscription).where(eq(subscription.userId, bob.id))).toEqual([]);
    const own = await client.verify(alice.accessToken, proof);
    expect(own.status).toBe(200);
    expect((own.body as EntitlementsBody).plan).toBe('premium');
  });

  it('droits et essai d’un compte sans effet sur un autre, réponse sans donnée d’autrui', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    const purchase = appStorePurchase(new Date(now + 30 * 86_400_000));
    expect((await client.verify(alice.accessToken, purchase.first)).status).toBe(200);
    const aliceBefore = await db.select().from(user).where(eq(user.id, alice.id));
    const subsBefore = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, alice.id));

    const trial = await client.startTrial(bob.accessToken);
    const read = await client.get(bob.accessToken);
    for (const res of [trial, read]) {
      expect(res.status).toBe(200);
      expect((res.body as EntitlementsBody).plan).toBe('trial');
      for (const secret of [alice.id, alice.email, alice.notebookId]) {
        expect(JSON.stringify(res.body)).not.toContain(secret);
      }
    }
    expect(await db.select().from(user).where(eq(user.id, alice.id))).toEqual(aliceBefore);
    expect(await db.select().from(subscription).where(eq(subscription.userId, alice.id))).toEqual(
      subsBefore,
    );
    expect(((await client.get(alice.accessToken)).body as EntitlementsBody).trialAvailable).toBe(
      true,
    );
  });

  it('deux appareils restaurent le même achat en même temps : une seule ligne', async () => {
    const t = await createTenant(app, db, clock.now());
    const second = await client.login(t);
    const purchaseToken = `jeton.${newId()}`;
    const proof: PurchaseProof = { store: 'google_play', purchaseToken };
    stores.answer(proof, {
      store: 'google_play',
      purchaseKey: purchaseToken,
      productCode: 'premium_monthly',
      status: 'active',
      expiresAt: new Date(now + 30 * 86_400_000),
    });
    const results = await Promise.all([
      client.verify(t.accessToken, proof),
      client.verify(second, proof),
      client.verify(t.accessToken, proof),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.select().from(subscription).where(eq(subscription.userId, t.id))).toHaveLength(
      1,
    );
  });
});
