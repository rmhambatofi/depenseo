// Vérification Google Play (ADR-040) par la Google Play Developer API, `purchases.subscriptionsv2.get` :
// GET /androidpublisher/v3/applications/{package}/purchases/subscriptionsv2/tokens/{jeton}, avec un
// jeton OAuth du compte de service (portée androidpublisher). L'URL porte le nom du paquet : un jeton
// d'une autre application est inconnu (404). L'accusé de réception de l'achat (sous 3 jours) est
// fait par l'application (Play Billing Library), pas par l'API.
import type { Clock } from '../clock.js';
import { type ServiceAccount, ServiceAccountToken } from '../google/service-account-token.js';
import {
  InvalidReceiptError,
  latestPremium,
  type PurchaseProof,
  type PurchaseStatus,
  type StoreReceiptVerifier,
  StoreUnavailableError,
  type VerifiedPurchase,
} from './store-receipt-verifier.js';

export const GOOGLE_PLAY_API_ORIGIN = 'https://androidpublisher.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export interface GooglePlayConfig extends ServiceAccount {
  packageName: string;
  apiOrigin: string;
}

const REQUEST_TIMEOUT_MS = 10_000;
/** Jetons Play Billing : base64url et points, quelques centaines de caractères (pas `.`/`..`). */
const PURCHASE_TOKEN = /^(?!\.+$)[A-Za-z0-9._-]{1,2048}$/;

/** `subscriptionState` → état normalisé ; résilié (`CANCELED`) = droits jusqu'à l'échéance. */
const STATE: Readonly<Record<string, PurchaseStatus>> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'active',
  SUBSCRIPTION_STATE_ON_HOLD: 'suspended',
  SUBSCRIPTION_STATE_PAUSED: 'suspended',
  SUBSCRIPTION_STATE_PENDING: 'suspended',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};

interface SubscriptionPurchaseV2 {
  subscriptionState?: unknown;
  lineItems?: Array<{ productId?: unknown; expiryTime?: unknown }>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: unknown };
}

export class GooglePlayVerifier implements StoreReceiptVerifier {
  private readonly accessToken: ServiceAccountToken;

  constructor(
    private readonly config: GooglePlayConfig,
    clock: Clock,
  ) {
    this.accessToken = new ServiceAccountToken(config, SCOPE, clock, 'Google Play');
  }

  async verify(proof: PurchaseProof, signal?: AbortSignal): Promise<VerifiedPurchase> {
    if (proof.store !== 'google_play') throw new InvalidReceiptError('Preuve d’un autre store');
    if (!PURCHASE_TOKEN.test(proof.purchaseToken)) {
      throw new InvalidReceiptError('Jeton d’achat invalide');
    }
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      const access = await this.accessToken.get(combined);
      response = await fetch(
        `${this.config.apiOrigin}/androidpublisher/v3/applications/${encodeURIComponent(this.config.packageName)}` +
          `/purchases/subscriptionsv2/tokens/${proof.purchaseToken}`,
        { headers: { authorization: `Bearer ${access}` }, signal: combined },
      );
    } catch {
      throw new StoreUnavailableError('Google Play injoignable');
    }
    // 400 : jeton mal formé ; 404 / 410 : jeton inconnu de ce paquet ou trop ancien.
    if ([400, 404, 410].includes(response.status)) {
      throw new InvalidReceiptError('Jeton d’achat inconnu de Google Play');
    }
    if (response.status === 401) this.accessToken.invalidate();
    if (!response.ok) throw new StoreUnavailableError(`Google Play a répondu ${response.status}`);
    const body = (await response.json().catch(() => {
      throw new StoreUnavailableError('Réponse Google Play illisible');
    })) as SubscriptionPurchaseV2;
    const accountRef = body.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    const state =
      typeof body.subscriptionState === 'string' ? STATE[body.subscriptionState] : undefined;
    const candidates = (body.lineItems ?? []).flatMap((item) => {
      const expires = typeof item.expiryTime === 'string' ? Date.parse(item.expiryTime) : NaN;
      if (typeof item.productId !== 'string' || Number.isNaN(expires)) return [];
      return [
        {
          store: 'google_play' as const,
          purchaseKey: proof.purchaseToken,
          productCode: item.productId,
          status: state ?? ('suspended' as const),
          expiresAt: new Date(expires),
          ...(typeof accountRef === 'string' && { accountRef: accountRef.toLowerCase() }),
        },
      ];
    });
    return latestPremium(candidates);
  }
}
