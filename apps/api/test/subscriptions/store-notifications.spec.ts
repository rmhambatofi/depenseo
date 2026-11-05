// Notifications serveur des stores (F-ABO-01, §5, ADR-041) : signature Apple ou jeton Pub/Sub
// invalide → 401 ; une notification authentifiée relit l'achat auprès du store (faux vérificateur)
// et met à jour l'abonnement : renouvellement, expiration → export Excel refusé (403) mais données
// conservées. Plage d'horloge : septembre 2027.
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expense, subscription } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type {
  PurchaseProof,
  VerifiedPurchase,
} from '../../src/subscriptions/store-receipt-verifier.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { auth, expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import {
  APPLE_TEST_ROOT,
  BUNDLE,
  ec,
  ISSUER,
  jws,
  PACKAGE,
  pkcs8,
  rsa,
} from '../support/store-fixtures.js';
import { type EntitlementsBody, subscriptionClient } from '../support/subscription-client.js';
import { FakeStoreVerifier } from '../support/subscriptions.js';

const DAY = 86_400_000;
const AUDIENCE = 'https://api.depenseo.test/api/v1/store-notifications/google-play';
const PUSH_ACCOUNT = 'pubsub-push@depenseo-test.iam.gserviceaccount.com';
const STORE_ENV = {
  APP_STORE_ISSUER_ID: ISSUER,
  APP_STORE_KEY_ID: 'ABCDE12345',
  APP_STORE_PRIVATE_KEY: pkcs8(ec.privateKey),
  APP_STORE_BUNDLE_ID: BUNDLE,
  GOOGLE_PLAY_PACKAGE_NAME: PACKAGE,
  GOOGLE_PLAY_CLIENT_EMAIL: 'play-api@depenseo-test.iam.gserviceaccount.com',
  GOOGLE_PLAY_PRIVATE_KEY: pkcs8(rsa.privateKey),
  GOOGLE_PLAY_PUSH_AUDIENCE: AUDIENCE,
  GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT: PUSH_ACCOUNT,
};

describe('notifications serveur des stores (F-ABO-01)', () => {
  const now = Date.UTC(2027, 8, 10, 9, 0, 0);
  const clock = new FakeClock(now);
  const stores = new FakeStoreVerifier();
  const { pool, db } = testDb(4);
  let app: INestApplication;
  const client = subscriptionClient(() => app);
  const expenses = expenseClient(() => app, db, clock);

  beforeAll(async () => {
    ({ app } = await startTestApp({
      clock,
      storeVerifier: stores,
      env: STORE_ENV,
      storeNotificationKeys: {
        appleRoots: [APPLE_TEST_ROOT],
        googlePush: () => Promise.resolve(rsa.publicKey),
      },
    }));
  });
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const purchase = (
    store: VerifiedPurchase['store'],
    key: string,
    o: Partial<VerifiedPurchase>,
  ) => ({
    store,
    purchaseKey: key,
    productCode: 'premium_monthly',
    status: 'active' as const,
    expiresAt: new Date(now + 30 * DAY),
    ...o,
  });
  const entitlements = async (token: string) => (await client.get(token)).body as EntitlementsBody;
  const rowOf = async (store: VerifiedPurchase['store'], userId: string) =>
    (
      await db
        .select()
        .from(subscription)
        .where(and(eq(subscription.userId, userId), eq(subscription.store, store)))
    )[0];

  // --- App Store ---------------------------------------------------------------------------------

  /** Compte abonné via l'App Store (achat déjà présenté par l'application). */
  async function appStoreSubscriber() {
    const t = await expenses.tenant();
    const original = unique();
    const proof: PurchaseProof = { store: 'app_store', transactionId: original };
    stores.answer(proof, purchase('app_store', original, {}));
    expect((await client.verify(t.t.accessToken, proof)).status).toBe(200);
    return { ...t, original, proof };
  }

  const appleNotification = async (
    original: string,
    o: { chain?: 'trusted' | 'rogue'; bundleId?: string; environment?: string; type?: string } = {},
  ) => ({
    signedPayload: await jws(
      {
        notificationType: o.type ?? 'DID_RENEW',
        notificationUUID: newId(),
        version: '2.0',
        signedDate: clock.now().getTime(),
        data: {
          bundleId: o.bundleId ?? BUNDLE,
          environment: o.environment ?? 'Production',
          signedTransactionInfo: await jws(
            { originalTransactionId: original, transactionId: unique(), bundleId: BUNDLE },
            o.chain,
          ),
        },
      },
      o.chain,
    ),
  });
  const postApple = (body: object) =>
    request(http(app)).post('/api/v1/store-notifications/app-store').send(body);

  it('App Store : signature hors racine Apple → 401, aucune relecture ni mise à jour', async () => {
    const { t, original } = await appStoreSubscriber();
    const before = await rowOf('app_store', t.id);
    const calls = stores.calls.length;
    expect((await postApple(await appleNotification(original, { chain: 'rogue' }))).status).toBe(
      401,
    );
    expect((await postApple({ signedPayload: 'a.b.c' })).status).toBe(401);
    expect((await postApple({})).status).toBe(400);
    expect(stores.calls.length).toBe(calls);
    expect(await rowOf('app_store', t.id)).toEqual(before);
  });

  it('App Store : renouvellement → échéance prolongée, relue auprès du store', async () => {
    const { t, original } = await appStoreSubscriber();
    const renewed = new Date(now + 60 * DAY);
    stores.answer(
      { store: 'app_store', transactionId: original },
      purchase('app_store', original, { expiresAt: renewed }),
    );
    clock.advance(1000);
    try {
      expect((await postApple(await appleNotification(original))).status).toBe(200);
      expect(stores.calls.at(-1)).toEqual({ store: 'app_store', transactionId: original });
      expect(await entitlements(t.accessToken)).toMatchObject({
        plan: 'premium',
        premiumUntil: renewed.toISOString(),
      });
      expect((await rowOf('app_store', t.id))?.verifiedAt).toEqual(clock.now());
    } finally {
      clock.set(now);
    }
  });

  it('App Store : autre bundle, autre environnement, achat inconnu → 200 sans effet', async () => {
    const { t, original } = await appStoreSubscriber();
    const before = await rowOf('app_store', t.id);
    stores.answer(
      { store: 'app_store', transactionId: original },
      purchase('app_store', original, { status: 'expired', expiresAt: new Date(now - DAY) }),
    );
    for (const o of [{ bundleId: 'com.autre.app' }, { environment: 'Sandbox' }]) {
      expect((await postApple(await appleNotification(original, o))).status).toBe(200);
    }
    expect(await rowOf('app_store', t.id)).toEqual(before);
    // Achat jamais présenté par un compte : rien n'est créé.
    const stranger = unique();
    stores.answer(
      { store: 'app_store', transactionId: stranger },
      purchase('app_store', stranger, {}),
    );
    const count = (await db.select().from(subscription)).length;
    expect((await postApple(await appleNotification(stranger))).status).toBe(200);
    expect((await db.select().from(subscription)).length).toBe(count);
  });

  it('App Store : store injoignable pendant la relecture → 503 (Apple relivrera)', async () => {
    const { original } = await appStoreSubscriber();
    stores.answer({ store: 'app_store', transactionId: original }, 'unavailable');
    expect((await postApple(await appleNotification(original))).status).toBe(503);
  });

  // --- Google Play -------------------------------------------------------------------------------

  const pushToken = (
    o: {
      aud?: string;
      email?: string;
      verified?: boolean;
      iss?: string;
      age?: number;
      key?: typeof rsa.privateKey;
    } = {},
  ) => {
    const iat = Math.floor(clock.now().getTime() / 1000) - (o.age ?? 0);
    return new SignJWT({ email: o.email ?? PUSH_ACCOUNT, email_verified: o.verified ?? true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(o.iss ?? 'https://accounts.google.com')
      .setAudience(o.aud ?? AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(o.key ?? rsa.privateKey);
  };
  const pushBody = (notification: object) => ({
    message: {
      data: Buffer.from(JSON.stringify(notification)).toString('base64'),
      messageId: unique(),
      publishTime: clock.now().toISOString(),
    },
    subscription: 'projects/depenseo/subscriptions/play-rtdn',
  });
  const playNotification = (purchaseToken: string, type = 2) =>
    pushBody({
      version: '1.0',
      packageName: PACKAGE,
      eventTimeMillis: String(clock.now().getTime()),
      subscriptionNotification: {
        version: '1.0',
        notificationType: type,
        purchaseToken,
        subscriptionId: 'premium_monthly',
      },
    });
  const postGoogle = (body: object, token?: string) => {
    const req = request(http(app)).post('/api/v1/store-notifications/google-play');
    return (token === undefined ? req : req.set('Authorization', `Bearer ${token}`)).send(body);
  };

  async function playSubscriber() {
    const t = await expenses.tenant();
    const purchaseToken = `tok.${unique()}`;
    const proof: PurchaseProof = { store: 'google_play', purchaseToken };
    stores.answer(proof, purchase('google_play', purchaseToken, {}));
    expect((await client.verify(t.t.accessToken, proof)).status).toBe(200);
    return { ...t, purchaseToken, proof };
  }

  it('Google Play : jeton Pub/Sub absent, mal signé, autre audience ou autre compte → 401', async () => {
    const { t, purchaseToken } = await playSubscriber();
    const before = await rowOf('google_play', t.id);
    const calls = stores.calls.length;
    const body = playNotification(purchaseToken);
    const other = (await import('node:crypto')).generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect((await postGoogle(body)).status).toBe(401);
    expect((await postGoogle(body, 'pas.un.jeton')).status).toBe(401);
    expect((await postGoogle(body, await pushToken({ key: other.privateKey }))).status).toBe(401);
    expect(
      (await postGoogle(body, await pushToken({ aud: 'https://ailleurs.test/' }))).status,
    ).toBe(401);
    expect((await postGoogle(body, await pushToken({ email: 'x@evil.test' }))).status).toBe(401);
    for (const o of [{ verified: false }, { iss: 'https://evil.test' }, { age: 3700 }]) {
      expect((await postGoogle(body, await pushToken(o))).status, JSON.stringify(o)).toBe(401);
    }
    expect(stores.calls.length).toBe(calls);
    expect(await rowOf('google_play', t.id)).toEqual(before);
  });

  it('Google Play : clés Google injoignables → 503 (Pub/Sub relivrera)', async () => {
    const { app: offline } = await startTestApp({
      clock,
      storeVerifier: stores,
      env: STORE_ENV,
      storeNotificationKeys: {
        googlePush: () => Promise.reject(new TypeError('fetch failed')),
      },
    });
    try {
      const res = await request(http(offline))
        .post('/api/v1/store-notifications/google-play')
        .set('Authorization', `Bearer ${await pushToken()}`)
        .send(playNotification('tok.x'));
      expect(res.status).toBe(503);
    } finally {
      await offline.close();
    }
  });

  it('Google Play : renouvellement → échéance prolongée ; autre paquet ou test → sans effet', async () => {
    const { t, purchaseToken, proof } = await playSubscriber();
    const renewed = new Date(now + 45 * DAY);
    stores.answer(proof, purchase('google_play', purchaseToken, { expiresAt: renewed }));
    const token = await pushToken();
    expect((await postGoogle(playNotification(purchaseToken), token)).status).toBe(200);
    expect((await entitlements(t.accessToken)).premiumUntil).toBe(renewed.toISOString());

    stores.answer(proof, purchase('google_play', purchaseToken, { status: 'revoked' }));
    const elsewhere = pushBody({
      packageName: 'com.autre.app',
      subscriptionNotification: { purchaseToken },
    });
    expect((await postGoogle(elsewhere, token)).status).toBe(200);
    const test = pushBody({ packageName: PACKAGE, testNotification: { version: '1.0' } });
    expect((await postGoogle(test, token)).status).toBe(200);
    expect((await rowOf('google_play', t.id))?.status).toBe('active');
    expect((await postGoogle({ message: { data: '!!!' }, subscription: 's' }, token)).status).toBe(
      400,
    );
  });

  it('Google Play : remboursement (achat annulé) → abonnement révoqué', async () => {
    const { t, purchaseToken, proof } = await playSubscriber();
    stores.answer(proof, purchase('google_play', purchaseToken, { status: 'revoked' }));
    const voided = pushBody({
      packageName: PACKAGE,
      voidedPurchaseNotification: { purchaseToken, orderId: 'GPA.1', productType: 1 },
    });
    expect((await postGoogle(voided, await pushToken())).status).toBe(200);
    expect((await rowOf('google_play', t.id))?.status).toBe('revoked');
    expect((await entitlements(t.accessToken)).plan).toBe('free');
  });

  // --- Fin du Premium : lecture seule (§5) -------------------------------------------------------

  it('expiration → export Excel refusé (403), données et abonnement conservés, CSV toujours permis', async () => {
    const { t, categoryId, purchaseToken, proof } = await playSubscriber();
    const spentId = newId();
    expect(
      (await expenses.create(t, { id: spentId, amount: 1999, categoryId, date: '2027-09-05' }))
        .status,
    ).toBe(201);
    const exportOf = (format: string) =>
      request(http(app))
        .post(`/api/v1/notebooks/${t.notebookId}/exports`)
        .set(auth(t))
        .send({ id: newId(), format, from: '2027-09-01', to: '2027-09-30' });
    expect((await exportOf('xlsx')).status).toBe(202);

    stores.answer(
      proof,
      purchase('google_play', purchaseToken, { status: 'expired', expiresAt: new Date(now - 1) }),
    );
    expect((await postGoogle(playNotification(purchaseToken, 13), await pushToken())).status).toBe(
      200,
    );

    expect((await entitlements(t.accessToken)).plan).toBe('free');
    expect((await exportOf('xlsx')).status).toBe(403);
    expect((await exportOf('csv')).status).toBe(202);
    const listed = (await expenses.list(t)).body as { items: Array<{ id: string }> };
    expect(listed.items.map((e) => e.id)).toContain(spentId);
    expect(
      await db.select({ id: expense.id }).from(expense).where(eq(expense.id, spentId)),
    ).toHaveLength(1);
    expect((await rowOf('google_play', t.id))?.status).toBe('expired');
  });
});
