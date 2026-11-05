// Vérification App Store (ADR-040) par l'App Store Server API, « Get All Subscription Statuses » :
// GET /inApps/v1/subscriptions/{transactionId}, authentifié par un jeton ES256 de la clé d'API
// In-App Purchase (aud `appstoreconnect-v1`, `bid` = bundle). La réponse arrive par TLS directement
// d'Apple ; les JWS qu'elle contient (transaction, renouvellement) sont en outre vérifiés jusqu'à la
// racine Apple (`AppleSignedDataVerifier`, ADR-041), comme ceux des notifications serveur.
import { importPKCS8, SignJWT } from 'jose';
import type { Clock } from '../clock.js';
import type { AppleSignedDataVerifier } from './apple-signed-data.js';
import {
  InvalidReceiptError,
  latestPremium,
  type PurchaseProof,
  type PurchaseStatus,
  type StoreReceiptVerifier,
  StoreUnavailableError,
  type VerifiedPurchase,
} from './store-receipt-verifier.js';

export const APP_STORE_ORIGINS = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

export interface AppStoreConfig {
  issuerId: string;
  keyId: string;
  /** Clé PKCS#8 (PEM) de la clé d'API In-App Purchase. */
  privateKey: string;
  bundleId: string;
  origin: string;
}

const REQUEST_TIMEOUT_MS = 10_000;
const TRANSACTION_ID = /^[0-9]{1,32}$/;

interface StatusResponse {
  bundleId?: unknown;
  data?: Array<{
    lastTransactions?: Array<{
      status?: unknown;
      originalTransactionId?: unknown;
      signedTransactionInfo?: unknown;
      signedRenewalInfo?: unknown;
    }>;
  }>;
}

/** Statuts d'abonnement Apple : 1 actif, 2 expiré, 3 relance de paiement, 4 grâce, 5 révoqué. */
const STATUS: Readonly<Record<number, PurchaseStatus>> = {
  1: 'active',
  2: 'expired',
  3: 'suspended',
  4: 'active',
  5: 'revoked',
};

const millis = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;

export class AppStoreVerifier implements StoreReceiptVerifier {
  private key?: ReturnType<typeof importPKCS8>;

  constructor(
    private readonly config: AppStoreConfig,
    private readonly clock: Clock,
    private readonly signedData: AppleSignedDataVerifier,
  ) {}

  /** JWS absent → objet vide ; JWS refusé → réponse inexploitable (503, jamais « reçu invalide »). */
  private async payload(jws: unknown): Promise<Record<string, unknown>> {
    if (jws === undefined) return {};
    try {
      return await this.signedData.verify(jws);
    } catch {
      throw new StoreUnavailableError('Réponse App Store illisible');
    }
  }

  async verify(proof: PurchaseProof, signal?: AbortSignal): Promise<VerifiedPurchase> {
    if (proof.store !== 'app_store') throw new InvalidReceiptError('Preuve d’un autre store');
    if (!TRANSACTION_ID.test(proof.transactionId)) {
      throw new InvalidReceiptError('Identifiant de transaction invalide');
    }
    const response = await this.get(`/inApps/v1/subscriptions/${proof.transactionId}`, signal);
    // 400 : identifiant mal formé ; 404 : transaction inconnue de cet environnement.
    if (response.status === 400 || response.status === 404) {
      throw new InvalidReceiptError('Transaction inconnue de l’App Store');
    }
    if (!response.ok) throw new StoreUnavailableError(`App Store a répondu ${response.status}`);
    const body = (await response.json().catch(() => {
      throw new StoreUnavailableError('Réponse App Store illisible');
    })) as StatusResponse;
    if (body.bundleId !== this.config.bundleId) {
      throw new InvalidReceiptError('Achat d’une autre application');
    }
    const lastTransactions = (body.data ?? []).flatMap((group) => group.lastTransactions ?? []);
    const decoded = await Promise.all(
      lastTransactions.map(async (last) => ({
        last,
        transaction: await this.payload(last.signedTransactionInfo),
        renewal: await this.payload(last.signedRenewalInfo),
      })),
    );
    const candidates = decoded.flatMap(({ last, transaction, renewal }) => {
      const expires = millis(transaction.expiresDate);
      const status = typeof last.status === 'number' ? STATUS[last.status] : undefined;
      if (
        expires === undefined ||
        typeof transaction.productId !== 'string' ||
        typeof last.originalTransactionId !== 'string' ||
        transaction.bundleId !== this.config.bundleId
      ) {
        return [];
      }
      // Période de grâce : droits prolongés jusqu'à sa fin (portée par l'info de renouvellement).
      const grace = millis(renewal.gracePeriodExpiresDate) ?? 0;
      const revoked = transaction.revocationDate !== undefined;
      return [
        {
          store: 'app_store' as const,
          purchaseKey: last.originalTransactionId,
          productCode: transaction.productId,
          status: revoked ? ('revoked' as const) : (status ?? 'suspended'),
          expiresAt: new Date(last.status === 4 ? Math.max(expires, grace) : expires),
          ...(typeof transaction.appAccountToken === 'string' && {
            accountRef: transaction.appAccountToken.toLowerCase(),
          }),
        },
      ];
    });
    return latestPremium(candidates);
  }

  private async get(path: string, signal?: AbortSignal): Promise<Response> {
    this.key ??= importPKCS8(this.config.privateKey, 'ES256');
    const key = await this.key.catch(() => {
      this.key = undefined;
      throw new StoreUnavailableError('Clé d’API App Store inutilisable');
    });
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const token = await new SignJWT({ bid: this.config.bundleId })
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId, typ: 'JWT' })
      .setIssuer(this.config.issuerId)
      .setAudience('appstoreconnect-v1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 300)
      .sign(key);
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${this.config.origin}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new StoreUnavailableError('App Store injoignable');
    }
  }
}
