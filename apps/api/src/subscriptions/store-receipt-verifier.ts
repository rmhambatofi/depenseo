// Vérification serveur des achats (F-ABO-01, ADR-001, ADR-040). L'application mobile transmet une
// preuve d'achat ; l'API interroge le store et n'accorde le Premium que sur sa réponse. Un adaptateur
// RevenueCat pourrait plus tard implémenter la même interface.

export const STORES = ['app_store', 'google_play'] as const;
export type Store = (typeof STORES)[number];

/** Produits d'abonnement Premium, identiques dans les deux stores (§5 : mensuel, annuel). */
export const PREMIUM_PRODUCTS: readonly string[] = ['premium_monthly', 'premium_yearly'];

/**
 * État normalisé d'un abonnement. Seul `active` ouvre des droits, jusqu'à `expiresAt` (période de
 * grâce comprise ; un abonnement résilié reste `active` jusqu'à la fin de la période payée).
 * `suspended` : nouvelle tentative de paiement, suspension ou paiement en attente.
 */
export const PURCHASE_STATUSES = ['active', 'suspended', 'expired', 'revoked'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Preuve d'achat envoyée par l'application. */
export type PurchaseProof =
  /** Identifiant d'une transaction quelconque de l'abonnement (StoreKit 2). */
  | { store: 'app_store'; transactionId: string }
  /** Jeton d'achat Play Billing. */
  | { store: 'google_play'; purchaseToken: string };

export interface VerifiedPurchase {
  store: Store;
  /**
   * Clé stable de l'achat dans le store : `originalTransactionId` (App Store) ou jeton d'achat
   * (Google Play). Jamais journalisée ni stockée en clair (empreinte SHA-256).
   */
  purchaseKey: string;
  productCode: string;
  status: PurchaseStatus;
  /** Fin des droits payés (UTC). */
  expiresAt: Date;
  /**
   * Compte désigné par l'application au moment de l'achat (`appAccountToken` StoreKit 2,
   * `obfuscatedExternalAccountId` Play Billing = identifiant du compte Depenseo), s'il existe.
   */
  accountRef?: string;
}

export interface StoreReceiptVerifier {
  /**
   * @throws InvalidReceiptError preuve inconnue du store, d'une autre application ou d'un produit
   *   non Premium (→ 400).
   * @throws StoreUnavailableError store non configuré ou injoignable (→ 503).
   */
  verify(proof: PurchaseProof, signal?: AbortSignal): Promise<VerifiedPurchase>;
}

export const STORE_RECEIPT_VERIFIER = Symbol('STORE_RECEIPT_VERIFIER');

export class InvalidReceiptError extends Error {
  override readonly name = 'InvalidReceiptError';
}

export class StoreUnavailableError extends Error {
  override readonly name = 'StoreUnavailableError';
}

/**
 * Achat Premium retenu parmi `candidates` (produits inconnus écartés) : un achat `active` passe
 * avant tout autre, puis la date de fin la plus tardive.
 */
export function latestPremium<
  T extends { productCode: string; status: PurchaseStatus; expiresAt: Date },
>(candidates: readonly T[]): T {
  const premium = candidates.filter((c) => PREMIUM_PRODUCTS.includes(c.productCode));
  const [first, ...rest] = premium;
  if (!first) throw new InvalidReceiptError('Aucun abonnement Premium dans cet achat');
  const rank = (c: T) => [c.status === 'active' ? 1 : 0, c.expiresAt.getTime()] as const;
  return rest.reduce((best, c) => {
    const [a, b] = [rank(c), rank(best)];
    return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) ? c : best;
  }, first);
}

/** Aiguille chaque preuve vers le vérificateur de son store ; store absent → indisponible. */
export class RoutingStoreVerifier implements StoreReceiptVerifier {
  constructor(private readonly verifiers: Partial<Record<Store, StoreReceiptVerifier>>) {}

  verify(proof: PurchaseProof, signal?: AbortSignal): Promise<VerifiedPurchase> {
    const verifier = this.verifiers[proof.store];
    if (!verifier) return Promise.reject(new StoreUnavailableError(`${proof.store} non configuré`));
    return verifier.verify(proof, signal);
  }
}
