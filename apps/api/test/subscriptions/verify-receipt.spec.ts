// Vérification d'un achat POST /subscriptions/verify (F-ABO-01, ADR-040) : le Premium n'est accordé
// que sur la réponse du store (faux vérificateur), reçu refusé → 400, store indisponible → 503,
// aucune preuve d'achat en clair en base ni dans le journal. Plage d'horloge : août 2027.
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { subscription } from '../../src/db/schema/index.js';
import type { PurchaseProof } from '../../src/subscriptions/store-receipt-verifier.js';
import { createTenant } from '../support/access.js';
import { type LogCapture, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { type EntitlementsBody, subscriptionClient } from '../support/subscription-client.js';
import { FakeStoreVerifier } from '../support/subscriptions.js';
import { newId } from '../../src/db/uuid.js';

describe('vérification d’achat POST /subscriptions/verify (F-ABO-01)', () => {
  const now = Date.UTC(2027, 7, 20, 9, 0, 0);
  const inAMonth = new Date(now + 30 * 86_400_000);
  const clock = new FakeClock(now);
  const stores = new FakeStoreVerifier();
  const { pool, db } = testDb(2);
  let app: INestApplication;
  let logs: LogCapture;
  const client = subscriptionClient(() => app);

  beforeAll(async () => ({ app, logs } = await startTestApp({ clock, storeVerifier: stores })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  /** Preuve Google Play unique et sa réponse programmée. */
  function googlePurchase(overrides: { status?: 'active' | 'expired'; productCode?: string } = {}) {
    const purchaseToken = `jeton.${newId()}`;
    const proof: PurchaseProof = { store: 'google_play', purchaseToken };
    stores.answer(proof, {
      store: 'google_play',
      purchaseKey: purchaseToken,
      productCode: overrides.productCode ?? 'premium_yearly',
      status: overrides.status ?? 'active',
      expiresAt: inAMonth,
    });
    return { proof, purchaseToken };
  }

  it('achat valide : Premium jusqu’à l’échéance, ligne rattachée au compte sans le jeton en clair', async () => {
    const t = await createTenant(app, db, clock.now());
    const { proof, purchaseToken } = googlePurchase();
    const res = await client.verify(t.accessToken, proof);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      plan: 'premium',
      premiumUntil: inAMonth.toISOString(),
      trialEndsAt: null,
      trialAvailable: true,
    } satisfies EntitlementsBody);
    const rows = await db.select().from(subscription).where(eq(subscription.userId, t.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      store: 'google_play',
      productCode: 'premium_yearly',
      status: 'active',
      expiresAt: inAMonth,
    });
    expect(rows[0]!.purchaseKeyHash).toEqual(createHash('sha256').update(purchaseToken).digest());
    expect(logs.text).not.toContain(purchaseToken);
    expect(((await client.get(t.accessToken)).body as EntitlementsBody).plan).toBe('premium');
  });

  it('App Store : preuve par identifiant de transaction', async () => {
    const t = await createTenant(app, db, clock.now());
    const proof: PurchaseProof = { store: 'app_store', transactionId: '2000000123456789' };
    stores.answer(proof, {
      store: 'app_store',
      purchaseKey: `1000000${Date.now()}`,
      productCode: 'premium_monthly',
      status: 'active',
      expiresAt: inAMonth,
    });
    const res = await client.verify(t.accessToken, proof);
    expect(res.status).toBe(200);
    expect((res.body as EntitlementsBody).plan).toBe('premium');
  });

  it('reçu invalide → 400, aucun droit ni ligne', async () => {
    const t = await createTenant(app, db, clock.now());
    const res = await client.verify(t.accessToken, {
      store: 'google_play',
      purchaseToken: 'inconnu-du-store',
    });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(await db.select().from(subscription).where(eq(subscription.userId, t.id))).toEqual([]);
    expect(((await client.get(t.accessToken)).body as EntitlementsBody).plan).toBe('free');
  });

  it('produit non Premium renvoyé par le store → 400', async () => {
    const t = await createTenant(app, db, clock.now());
    const { proof } = googlePurchase({ productCode: 'autre_produit' });
    expect((await client.verify(t.accessToken, proof)).status).toBe(400);
    expect(await db.select().from(subscription).where(eq(subscription.userId, t.id))).toEqual([]);
  });

  it('achat échu : enregistré, mais aucun droit', async () => {
    const t = await createTenant(app, db, clock.now());
    const { proof } = googlePurchase({ status: 'expired' });
    const res = await client.verify(t.accessToken, proof);
    expect(res.status).toBe(200);
    expect((res.body as EntitlementsBody).plan).toBe('free');
  });

  it('store injoignable ou non configuré → 503', async () => {
    const t = await createTenant(app, db, clock.now());
    const proof: PurchaseProof = { store: 'app_store', transactionId: '42' };
    stores.answer(proof, 'unavailable');
    expect((await client.verify(t.accessToken, proof)).status).toBe(503);
  });

  it.each([
    ['store inconnu', { store: 'amazon', purchaseToken: 'x' }],
    ['preuve d’un autre store', { store: 'app_store', purchaseToken: 'x' }],
    ['champ inconnu', { store: 'google_play', purchaseToken: 'x', userId: 'y' }],
    ['jeton vide', { store: 'google_play', purchaseToken: '' }],
    ['corps vide', {}],
  ])('corps invalide (%s) → 400 sans appel au store', async (_label, body) => {
    const t = await createTenant(app, db, clock.now());
    const before = stores.calls.length;
    expect((await client.verify(t.accessToken, body)).status).toBe(400);
    expect(stores.calls.length).toBe(before);
  });

  it('sans jeton → 401', async () => {
    const { proof } = googlePurchase();
    expect((await client.verify('jeton-invalide', proof)).status).toBe(401);
  });
});
