// App Store Server API (F-ABO-01, ADR-040) contre un serveur local : requête et jeton ES256, statuts
// Apple, grâce, révocation, compte désigné à l'achat, reçu invalide, panne ou réponse illisible.
import { decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { AppStoreVerifier } from '../../src/subscriptions/app-store-verifier.js';
import {
  InvalidReceiptError,
  StoreUnavailableError,
} from '../../src/subscriptions/store-receipt-verifier.js';
import {
  appleSignedData,
  BUNDLE,
  clock,
  closeServersAfterEach,
  DAY,
  ec,
  ISSUER,
  jws,
  NOW,
  pkcs8,
  serve,
  spki,
} from '../support/store-fixtures.js';

closeServersAfterEach();

async function lastTransaction(o: {
  status: number;
  productId?: string;
  expiresDate?: number;
  revocationDate?: number;
  grace?: number;
  original?: string;
  appAccountToken?: string;
}) {
  return {
    originalTransactionId: o.original ?? '1000000000000001',
    status: o.status,
    signedTransactionInfo: await jws({
      bundleId: BUNDLE,
      productId: o.productId ?? 'premium_monthly',
      originalTransactionId: o.original ?? '1000000000000001',
      expiresDate: o.expiresDate ?? NOW + 10 * DAY,
      ...(o.revocationDate !== undefined && { revocationDate: o.revocationDate }),
      ...(o.appAccountToken !== undefined && { appAccountToken: o.appAccountToken }),
    }),
    signedRenewalInfo: await jws(o.grace ? { gracePeriodExpiresDate: o.grace } : {}),
  };
}

describe('AppStoreVerifier (App Store Server API)', () => {
  const verifier = (origin: string) =>
    new AppStoreVerifier(
      {
        issuerId: ISSUER,
        keyId: 'ABCDE12345',
        privateKey: pkcs8(ec.privateKey),
        bundleId: BUNDLE,
        origin,
      },
      clock,
      appleSignedData,
    );
  const statusBody = (transactions: object[], bundleId = BUNDLE) => ({
    environment: 'Production',
    bundleId,
    data: [{ subscriptionGroupIdentifier: '2100', lastTransactions: transactions }],
  });

  it('GET /inApps/v1/subscriptions/{id} avec jeton ES256 (aud appstoreconnect-v1, bid)', async () => {
    const body = statusBody([await lastTransaction({ status: 1 })]);
    const server = await serve(() => ({ status: 200, body }));
    const purchase = await verifier(server.origin).verify({
      store: 'app_store',
      transactionId: '2000000000000002',
    });
    expect(purchase).toEqual({
      store: 'app_store',
      purchaseKey: '1000000000000001',
      productCode: 'premium_monthly',
      status: 'active',
      expiresAt: new Date(NOW + 10 * DAY),
    });
    const [req] = server.received;
    expect(req!.method).toBe('GET');
    expect(req!.path).toBe('/inApps/v1/subscriptions/2000000000000002');
    const token = String(req!.headers.authorization).replace(/^Bearer /, '');
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: 'ES256',
      kid: 'ABCDE12345',
      typ: 'JWT',
    });
    const { payload } = await jwtVerify(token, await importSPKI(spki(ec.publicKey), 'ES256'), {
      currentDate: clock.now(),
    });
    expect(payload).toMatchObject({ iss: ISSUER, aud: 'appstoreconnect-v1', bid: BUNDLE });
  });

  it.each([
    [2, 'expired'],
    [3, 'suspended'],
    [5, 'revoked'],
  ] as const)('statut Apple %i → %s', async (status, expected) => {
    const body = statusBody([await lastTransaction({ status })]);
    const server = await serve(() => ({ status: 200, body }));
    const purchase = await verifier(server.origin).verify({
      store: 'app_store',
      transactionId: '1',
    });
    expect(purchase.status).toBe(expected);
  });

  it('période de grâce (4) : droits jusqu’à la fin de la grâce', async () => {
    const grace = NOW + 16 * DAY;
    const body = statusBody([await lastTransaction({ status: 4, expiresDate: NOW - DAY, grace })]);
    const server = await serve(() => ({ status: 200, body }));
    const purchase = await verifier(server.origin).verify({
      store: 'app_store',
      transactionId: '1',
    });
    expect(purchase).toMatchObject({ status: 'active', expiresAt: new Date(grace) });
  });

  it('transaction remboursée (revocationDate) → revoked même si statut actif', async () => {
    const body = statusBody([await lastTransaction({ status: 1, revocationDate: NOW - DAY })]);
    const server = await serve(() => ({ status: 200, body }));
    expect(
      (await verifier(server.origin).verify({ store: 'app_store', transactionId: '1' })).status,
    ).toBe('revoked');
  });

  it('plusieurs abonnements : le Premium d’échéance la plus tardive, produits inconnus écartés', async () => {
    const body = statusBody([
      await lastTransaction({ status: 1, original: '11', expiresDate: NOW + 5 * DAY }),
      await lastTransaction({
        status: 1,
        original: '22',
        expiresDate: NOW + 300 * DAY,
        productId: 'premium_yearly',
      }),
      await lastTransaction({
        status: 1,
        original: '33',
        expiresDate: NOW + 900 * DAY,
        productId: 'autre',
      }),
    ]);
    const server = await serve(() => ({ status: 200, body }));
    const purchase = await verifier(server.origin).verify({
      store: 'app_store',
      transactionId: '1',
    });
    expect(purchase).toMatchObject({ purchaseKey: '22', productCode: 'premium_yearly' });
  });

  it.each([
    [
      'transaction inconnue (404)',
      () => Promise.resolve({ status: 404, body: { errorCode: 4040010 } }),
    ],
    [
      'identifiant refusé (400)',
      () => Promise.resolve({ status: 400, body: { errorCode: 4000006 } }),
    ],
    [
      'autre application',
      async () => ({
        status: 200,
        body: statusBody([await lastTransaction({ status: 1 })], 'com.autre'),
      }),
    ],
    [
      'aucun produit Premium',
      async () => ({
        status: 200,
        body: statusBody([await lastTransaction({ status: 1, productId: 'autre' })]),
      }),
    ],
  ])('%s → reçu invalide', async (_label, make) => {
    const answer = await make();
    const server = await serve(() => answer);
    await expect(
      verifier(server.origin).verify({ store: 'app_store', transactionId: '1' }),
    ).rejects.toBeInstanceOf(InvalidReceiptError);
  });

  it('identifiant non numérique → reçu invalide sans appel', async () => {
    const server = await serve(() => ({ status: 500 }));
    await expect(
      verifier(server.origin).verify({ store: 'app_store', transactionId: '../keys' }),
    ).rejects.toBeInstanceOf(InvalidReceiptError);
    expect(server.received).toEqual([]);
  });

  it.each([401, 429, 500])(
    '%i → store indisponible, sans l’identifiant dans le message',
    async (status) => {
      const server = await serve(() => ({ status }));
      const error = await verifier(server.origin)
        .verify({ store: 'app_store', transactionId: '777777777' })
        .then(
          () => new Error('vérification acceptée à tort'),
          (e: unknown) => e as Error,
        );
      expect(error).toBeInstanceOf(StoreUnavailableError);
      expect(error.message).not.toContain('777777777');
    },
  );

  it('compte désigné à l’achat (appAccountToken) renvoyé en minuscules', async () => {
    const body = statusBody([
      await lastTransaction({ status: 1, appAccountToken: '0190B6E2-7C1A-7000-8000-00000000000A' }),
    ]);
    const server = await serve(() => ({ status: 200, body }));
    const purchase = await verifier(server.origin).verify({
      store: 'app_store',
      transactionId: '1',
    });
    expect(purchase.accountRef).toBe('0190b6e2-7c1a-7000-8000-00000000000a');
  });

  it('achat actif retenu avant un achat révoqué d’échéance plus lointaine', async () => {
    const body = statusBody([
      await lastTransaction({ status: 5, original: '11', expiresDate: NOW + 300 * DAY }),
      await lastTransaction({ status: 1, original: '22', expiresDate: NOW + 5 * DAY }),
    ]);
    const server = await serve(() => ({ status: 200, body }));
    const purchase = await verifier(server.origin).verify({
      store: 'app_store',
      transactionId: '1',
    });
    expect(purchase).toMatchObject({ purchaseKey: '22', status: 'active' });
  });

  it('200 au corps illisible → store indisponible (pas reçu invalide)', async () => {
    const server = await serve(() => ({ status: 200 }));
    await expect(
      verifier(server.origin).verify({ store: 'app_store', transactionId: '1' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('transaction signée hors de la racine Apple → store indisponible (jamais Premium)', async () => {
    const forged = await lastTransaction({ status: 1 });
    forged.signedTransactionInfo = await jws(
      { bundleId: BUNDLE, productId: 'premium_monthly', expiresDate: NOW + 10 * DAY },
      'rogue',
    );
    const server = await serve(() => ({ status: 200, body: statusBody([forged]) }));
    await expect(
      verifier(server.origin).verify({ store: 'app_store', transactionId: '1' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('clé d’API inutilisable → store indisponible, sans appel', async () => {
    const server = await serve(() => ({ status: 200 }));
    const broken = new AppStoreVerifier(
      {
        issuerId: ISSUER,
        keyId: 'ABCDE12345',
        privateKey: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
        bundleId: BUNDLE,
        origin: server.origin,
      },
      clock,
      appleSignedData,
    );
    await expect(broken.verify({ store: 'app_store', transactionId: '1' })).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
    expect(server.received).toEqual([]);
  });

  it('serveur injoignable → store indisponible', async () => {
    const server = await serve(() => ({ status: 200 }));
    await server.close();
    await expect(
      verifier(server.origin).verify({ store: 'app_store', transactionId: '1' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });
});
