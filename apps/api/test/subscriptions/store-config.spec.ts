// Configuration des stores (ADR-040) : groupes de variables tout ou rien, store absent = 503.
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { createStoreVerifier } from '../../src/subscriptions/store-config.js';
import { StoreUnavailableError } from '../../src/subscriptions/store-receipt-verifier.js';
import { TEST_ENV } from '../support/app.js';
import { BUNDLE, clock, ec, ISSUER, pkcs8, rsa } from '../support/store-fixtures.js';

describe('configuration des stores', () => {
  const APPLE = {
    APP_STORE_ISSUER_ID: ISSUER,
    APP_STORE_KEY_ID: 'ABCDE12345',
    APP_STORE_PRIVATE_KEY: pkcs8(ec.privateKey).replace(/\n/g, '\\n'),
    APP_STORE_BUNDLE_ID: BUNDLE,
  };
  const GOOGLE = {
    GOOGLE_PLAY_PACKAGE_NAME: 'app.depenseo.android',
    GOOGLE_PLAY_CLIENT_EMAIL: 'play@depenseo-test.iam.gserviceaccount.com',
    GOOGLE_PLAY_PRIVATE_KEY: pkcs8(rsa.privateKey),
  };

  it('aucune variable : démarrage accepté, vérifications indisponibles', async () => {
    const verifier = createStoreVerifier(loadConfig(TEST_ENV), clock);
    await expect(
      verifier.verify({ store: 'app_store', transactionId: '1' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
    await expect(
      verifier.verify({ store: 'google_play', purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('groupes complets : PEM aux `\\n` échappés restauré, production par défaut', () => {
    const config = loadConfig({ ...TEST_ENV, ...APPLE, ...GOOGLE });
    expect(config.APP_STORE_PRIVATE_KEY).toBe(pkcs8(ec.privateKey));
    expect(config.APP_STORE_ENVIRONMENT).toBe('production');
    expect(createStoreVerifier(config, clock)).toBeDefined();
  });

  it('groupe incomplet : refus qui nomme les variables manquantes sans valeur', () => {
    const partialApple: Record<string, string> = { ...APPLE };
    delete partialApple.APP_STORE_PRIVATE_KEY;
    const partialGoogle: Record<string, string> = { ...GOOGLE };
    delete partialGoogle.GOOGLE_PLAY_CLIENT_EMAIL;
    const attempt = () => loadConfig({ ...TEST_ENV, ...partialApple, ...partialGoogle });
    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/APP_STORE_PRIVATE_KEY : absente.*GOOGLE_PLAY_CLIENT_EMAIL : absente/);
    try {
      attempt();
    } catch (error) {
      expect((error as Error).message).not.toContain(ISSUER);
    }
  });
});
