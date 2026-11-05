// Notifications serveur des stores (F-ABO-01, ADR-041). Chaque notification authentifiée ne sert que
// de signal : l'achat qu'elle désigne est relu auprès du store (source de vérité, insensible à
// l'ordre d'arrivée et au rejeu), puis sa ligne `subscription` est mise à jour si elle existe.
// - App Store Server Notifications v2 : `{ signedPayload }`, JWS vérifié jusqu'à la racine Apple.
// - Google Play RTDN : push Pub/Sub authentifié par un jeton OIDC Google (`Authorization: Bearer`).
import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import type { AppConfig } from '../config/env.js';
import { ProblemException } from '../errors/problem.exception.js';
import { parseBody } from '../http/parse-body.js';
import { APPLE_ROOT_CA_G3, AppleSignedDataVerifier } from './apple-signed-data.js';
import { SubscriptionsService } from './subscriptions.service.js';

export interface StoreNotificationKeys {
  /** Racines de confiance des JWS Apple (tests) ; Apple Root CA - G3 par défaut. */
  appleRoots?: readonly string[];
  /** Clés de signature des jetons OIDC Google (tests) ; JWKS Google par défaut. */
  googlePush?: JWTVerifyGetKey;
}

export interface StoreNotificationSettings {
  appStore?: {
    signedData: AppleSignedDataVerifier;
    bundleId: string;
    environment: 'Production' | 'Sandbox';
  };
  googlePlay?: {
    packageName: string;
    audience: string;
    serviceAccount: string;
    keys: JWTVerifyGetKey;
  };
}

export const STORE_NOTIFICATION_SETTINGS = Symbol('STORE_NOTIFICATION_SETTINGS');

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const CLOCK_TOLERANCE_S = 5;

export function notificationSettings(
  config: AppConfig,
  clock: Clock,
  keys: StoreNotificationKeys = {},
): StoreNotificationSettings {
  const settings: StoreNotificationSettings = {};
  if (config.APP_STORE_BUNDLE_ID) {
    settings.appStore = {
      signedData: new AppleSignedDataVerifier(keys.appleRoots ?? [APPLE_ROOT_CA_G3], clock),
      bundleId: config.APP_STORE_BUNDLE_ID,
      environment: config.APP_STORE_ENVIRONMENT === 'sandbox' ? 'Sandbox' : 'Production',
    };
  }
  if (
    config.GOOGLE_PLAY_PACKAGE_NAME &&
    config.GOOGLE_PLAY_PUSH_AUDIENCE &&
    config.GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT
  ) {
    settings.googlePlay = {
      packageName: config.GOOGLE_PLAY_PACKAGE_NAME,
      audience: config.GOOGLE_PLAY_PUSH_AUDIENCE,
      serviceAccount: config.GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT,
      keys: keys.googlePush ?? createRemoteJWKSet(new URL(GOOGLE_JWKS), { timeoutDuration: 5000 }),
    };
  }
  return settings;
}

export const appStoreBodySchema = z.object({ signedPayload: z.string().min(1).max(65_536) });

export const pubSubPushSchema = z.object({
  message: z.object({ data: z.string().max(65_536) }),
  subscription: z.string().max(512),
});

/** Contenu (`message.data` décodé) d'une notification Google Play ; champs inconnus ignorés. */
const developerNotificationSchema = z.object({
  packageName: z.string(),
  subscriptionNotification: z.object({ purchaseToken: z.string() }).optional(),
  voidedPurchaseNotification: z
    .object({ purchaseToken: z.string(), productType: z.number() })
    .optional(),
});

/** `productType` d'un achat annulé (remboursement, rétrofacturation) : 1 = abonnement. */
const VOIDED_SUBSCRIPTION = 1;

const unauthenticated = () => new ProblemException(401, 'Notification non authentifiée');
const unconfigured = () => new ProblemException(503, 'Notifications de ce store non configurées');

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

@Injectable()
export class StoreNotificationsService {
  constructor(
    @Inject(STORE_NOTIFICATION_SETTINGS) private readonly settings: StoreNotificationSettings,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async appStore(body: unknown): Promise<void> {
    const settings = this.settings.appStore;
    if (!settings) throw unconfigured();
    const { signedPayload } = parseBody(appStoreBodySchema, body);
    const verify = (jws: unknown) =>
      settings.signedData.verify(jws).catch(() => {
        throw unauthenticated();
      });
    const data = record((await verify(signedPayload)).data);
    // Autre application ou autre environnement (bac à sable vers la production) : ignorée.
    if (data?.bundleId !== settings.bundleId || data.environment !== settings.environment) return;
    // Notification sans transaction (TEST, CONSUMPTION_REQUEST…) : rien à relire.
    if (data.signedTransactionInfo === undefined) return;
    const transaction = await verify(data.signedTransactionInfo);
    if (typeof transaction.originalTransactionId !== 'string') return;
    await this.subscriptions.refresh({
      store: 'app_store',
      transactionId: transaction.originalTransactionId,
    });
  }

  async googlePlay(authorization: string | undefined, body: unknown): Promise<void> {
    const settings = this.settings.googlePlay;
    if (!settings) throw unconfigured();
    await this.authenticatePush(authorization, settings);
    const { message } = parseBody(pubSubPushSchema, body);
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
    } catch {
      throw new ProblemException(400, 'Champs invalides : message.data');
    }
    const parsed = developerNotificationSchema.safeParse(decoded);
    if (!parsed.success) throw new ProblemException(400, 'Champs invalides : message.data');
    const notification = parsed.data;
    if (notification.packageName !== settings.packageName) return;
    const voided = notification.voidedPurchaseNotification;
    const purchaseToken =
      notification.subscriptionNotification?.purchaseToken ??
      (voided?.productType === VOIDED_SUBSCRIPTION ? voided.purchaseToken : undefined);
    // Notification de test, achat ponctuel : rien à relire.
    if (purchaseToken === undefined) return;
    await this.subscriptions.refresh({ store: 'google_play', purchaseToken });
  }

  private async authenticatePush(
    authorization: string | undefined,
    settings: NonNullable<StoreNotificationSettings['googlePlay']>,
  ): Promise<void> {
    const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization ?? '')?.[1];
    if (!token) throw unauthenticated();
    let payload;
    try {
      ({ payload } = await jwtVerify(token, settings.keys, {
        algorithms: ['RS256'],
        issuer: GOOGLE_ISSUERS,
        audience: settings.audience,
        currentDate: this.clock.now(),
        clockTolerance: CLOCK_TOLERANCE_S,
        requiredClaims: ['exp', 'iat', 'email'],
      }));
    } catch (error) {
      // Seule une erreur jose propre au jeton le refuse ; tout le reste (JWKS hors délai ou
      // illisible, `fetch failed` relancé tel quel par jose) = clés Google injoignables : refus
      // temporaire, Pub/Sub relivrera.
      const keysUnavailable =
        !(error instanceof errors.JOSEError) ||
        error instanceof errors.JWKSTimeout ||
        error instanceof errors.JWKSInvalid ||
        error.code === 'ERR_JOSE_GENERIC';
      if (keysUnavailable) throw new ProblemException(503, 'Clés Google indisponibles');
      throw unauthenticated();
    }
    if (payload.email !== settings.serviceAccount || payload.email_verified !== true) {
      throw unauthenticated();
    }
  }
}
