// Vérificateurs de reçus construits depuis la configuration (ADR-040) : un store sans variables
// est indisponible (503 sur ses vérifications), sans empêcher le démarrage.
import type { Clock } from '../clock.js';
import type { AppConfig } from '../config/env.js';
import { GOOGLE_TOKEN_URL } from '../google/service-account-token.js';
import { APPLE_ROOT_CA_G3, AppleSignedDataVerifier } from './apple-signed-data.js';
import { APP_STORE_ORIGINS, AppStoreVerifier } from './app-store-verifier.js';
import { GOOGLE_PLAY_API_ORIGIN, GooglePlayVerifier } from './google-play-verifier.js';
import { RoutingStoreVerifier } from './store-receipt-verifier.js';

/** `appleRoots` : racines de confiance des JWS Apple (tests) ; Apple Root CA - G3 par défaut. */
export function createStoreVerifier(
  config: AppConfig,
  clock: Clock,
  appleRoots: readonly string[] = [APPLE_ROOT_CA_G3],
): RoutingStoreVerifier {
  const apple =
    config.APP_STORE_ISSUER_ID &&
    config.APP_STORE_KEY_ID &&
    config.APP_STORE_PRIVATE_KEY &&
    config.APP_STORE_BUNDLE_ID
      ? new AppStoreVerifier(
          {
            issuerId: config.APP_STORE_ISSUER_ID,
            keyId: config.APP_STORE_KEY_ID,
            privateKey: config.APP_STORE_PRIVATE_KEY,
            bundleId: config.APP_STORE_BUNDLE_ID,
            origin: APP_STORE_ORIGINS[config.APP_STORE_ENVIRONMENT],
          },
          clock,
          new AppleSignedDataVerifier(appleRoots, clock),
        )
      : undefined;
  const google =
    config.GOOGLE_PLAY_PACKAGE_NAME &&
    config.GOOGLE_PLAY_CLIENT_EMAIL &&
    config.GOOGLE_PLAY_PRIVATE_KEY
      ? new GooglePlayVerifier(
          {
            packageName: config.GOOGLE_PLAY_PACKAGE_NAME,
            clientEmail: config.GOOGLE_PLAY_CLIENT_EMAIL,
            privateKey: config.GOOGLE_PLAY_PRIVATE_KEY,
            tokenUrl: GOOGLE_TOKEN_URL,
            apiOrigin: GOOGLE_PLAY_API_ORIGIN,
          },
          clock,
        )
      : undefined;
  return new RoutingStoreVerifier({
    ...(apple && { app_store: apple }),
    ...(google && { google_play: google }),
  });
}
