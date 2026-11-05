// Google Play Developer API (F-ABO-01, ADR-040) contre un serveur local : jeton OAuth du compte de
// service, subscriptionsv2.get, états, compte désigné à l'achat, reçu invalide, panne.
import { importSPKI, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { GooglePlayVerifier } from '../../src/subscriptions/google-play-verifier.js';
import {
  InvalidReceiptError,
  StoreUnavailableError,
} from '../../src/subscriptions/store-receipt-verifier.js';
import type { ReceivedRequest } from '../support/local-server.js';
import {
  clock,
  closeServersAfterEach,
  DAY,
  NOW,
  PACKAGE,
  pkcs8,
  rsa,
  serve,
  spki,
} from '../support/store-fixtures.js';

closeServersAfterEach();

describe('GooglePlayVerifier (Google Play Developer API)', () => {
  async function setup(reply: (r: ReceivedRequest) => { status: number; body?: object }) {
    const server = await serve((r) =>
      r.path === '/token'
        ? { status: 200, body: { access_token: 'ya29.play', expires_in: 3600 } }
        : reply(r),
    );
    const verifier = new GooglePlayVerifier(
      {
        packageName: PACKAGE,
        clientEmail: 'play@depenseo-test.iam.gserviceaccount.com',
        privateKey: pkcs8(rsa.privateKey),
        tokenUrl: `${server.origin}/token`,
        apiOrigin: server.origin,
      },
      clock,
    );
    return { server, verifier };
  }
  const expiry = new Date(NOW + 30 * DAY);
  const active = {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ productId: 'premium_yearly', expiryTime: expiry.toISOString() }],
  };

  it('jeton OAuth (portée androidpublisher) puis subscriptionsv2.get du paquet', async () => {
    const { server, verifier } = await setup(() => ({ status: 200, body: active }));
    const purchase = await verifier.verify({ store: 'google_play', purchaseToken: 'tok.en-1_A' });
    expect(purchase).toEqual({
      store: 'google_play',
      purchaseKey: 'tok.en-1_A',
      productCode: 'premium_yearly',
      status: 'active',
      expiresAt: expiry,
    });
    const [oauth, get] = server.received;
    const { payload } = await jwtVerify(
      new URLSearchParams(oauth!.body).get('assertion')!,
      await importSPKI(spki(rsa.publicKey), 'RS256'),
      { currentDate: clock.now() },
    );
    expect(payload).toMatchObject({
      iss: 'play@depenseo-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
    });
    expect(get!.path).toBe(
      `/androidpublisher/v3/applications/${PACKAGE}/purchases/subscriptionsv2/tokens/tok.en-1_A`,
    );
    expect(get!.headers.authorization).toBe('Bearer ya29.play');
  });

  it.each([
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'active'],
    ['SUBSCRIPTION_STATE_CANCELED', 'active'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'suspended'],
    ['SUBSCRIPTION_STATE_PAUSED', 'suspended'],
    ['SUBSCRIPTION_STATE_PENDING', 'suspended'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'expired'],
    ['SUBSCRIPTION_STATE_INCONNU', 'suspended'],
  ])('%s → %s', async (state, expected) => {
    const { verifier } = await setup(() => ({
      status: 200,
      body: { ...active, subscriptionState: state },
    }));
    expect((await verifier.verify({ store: 'google_play', purchaseToken: 't' })).status).toBe(
      expected,
    );
  });

  it.each([400, 404, 410])('%i → reçu invalide', async (status) => {
    const { verifier } = await setup(() => ({ status, body: { error: { code: status } } }));
    await expect(
      verifier.verify({ store: 'google_play', purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(InvalidReceiptError);
  });

  it('aucun produit Premium → reçu invalide', async () => {
    const { verifier } = await setup(() => ({
      status: 200,
      body: { ...active, lineItems: [{ productId: 'autre', expiryTime: expiry.toISOString() }] },
    }));
    await expect(
      verifier.verify({ store: 'google_play', purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(InvalidReceiptError);
  });

  it.each(['a/../b', '..', '.', 'a?b', ''])(
    'jeton mal formé « %s » → reçu invalide sans appel',
    async (token) => {
      const { server, verifier } = await setup(() => ({ status: 200, body: active }));
      await expect(
        verifier.verify({ store: 'google_play', purchaseToken: token }),
      ).rejects.toBeInstanceOf(InvalidReceiptError);
      expect(server.received).toEqual([]);
    },
  );

  it('compte désigné à l’achat (obfuscatedExternalAccountId) renvoyé en minuscules', async () => {
    const { verifier } = await setup(() => ({
      status: 200,
      body: {
        ...active,
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: '0190B6E2-7C1A-7000-8000-00000000000B',
        },
      },
    }));
    expect((await verifier.verify({ store: 'google_play', purchaseToken: 't' })).accountRef).toBe(
      '0190b6e2-7c1a-7000-8000-00000000000b',
    );
  });

  it('200 au corps illisible → store indisponible (pas reçu invalide)', async () => {
    const { verifier } = await setup(() => ({ status: 200 }));
    await expect(
      verifier.verify({ store: 'google_play', purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('401 : jeton OAuth oublié, store indisponible ; 503 sans le jeton d’achat dans le message', async () => {
    let status = 401;
    const { server, verifier } = await setup(() => ({ status }));
    await expect(
      verifier.verify({ store: 'google_play', purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
    status = 503;
    const error = await verifier
      .verify({ store: 'google_play', purchaseToken: 'secret-purchase-token' })
      .then(
        () => new Error('vérification acceptée à tort'),
        (e: unknown) => e as Error,
      );
    expect(error).toBeInstanceOf(StoreUnavailableError);
    expect(error.message).not.toContain('secret-purchase-token');
    // Nouveau jeton OAuth demandé après le 401.
    expect(server.received.filter((r) => r.path === '/token')).toHaveLength(2);
  });

  it('refus du jeton OAuth → store indisponible', async () => {
    const server = await serve(() => ({ status: 401 }));
    const verifier = new GooglePlayVerifier(
      {
        packageName: PACKAGE,
        clientEmail: 'play@depenseo-test.iam.gserviceaccount.com',
        privateKey: pkcs8(rsa.privateKey),
        tokenUrl: `${server.origin}/token`,
        apiOrigin: server.origin,
      },
      clock,
    );
    await expect(
      verifier.verify({ store: 'google_play', purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });
});
