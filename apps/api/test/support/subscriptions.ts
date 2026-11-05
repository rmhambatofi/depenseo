// Abonnements (P5-01) : faux vérificateur de reçus (aucun appel aux stores) et insertion directe
// d'un abonnement en base.
import { createHash } from 'node:crypto';
import type { Database } from '../../src/db/connection.js';
import { subscription } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import {
  InvalidReceiptError,
  type PurchaseProof,
  type PurchaseStatus,
  type StoreReceiptVerifier,
  StoreUnavailableError,
  type VerifiedPurchase,
} from '../../src/subscriptions/store-receipt-verifier.js';

const proofKey = (proof: PurchaseProof) =>
  proof.store === 'app_store'
    ? `app_store:${proof.transactionId}`
    : `google_play:${proof.purchaseToken}`;

/** Réponses programmées par preuve ; preuve inconnue = reçu invalide. */
export class FakeStoreVerifier implements StoreReceiptVerifier {
  private readonly answers = new Map<string, VerifiedPurchase | 'unavailable'>();
  readonly calls: PurchaseProof[] = [];

  answer(proof: PurchaseProof, purchase: VerifiedPurchase | 'unavailable'): void {
    this.answers.set(proofKey(proof), purchase);
  }

  verify(proof: PurchaseProof): Promise<VerifiedPurchase> {
    this.calls.push(proof);
    const answer = this.answers.get(proofKey(proof));
    if (answer === 'unavailable') return Promise.reject(new StoreUnavailableError('panne simulée'));
    if (!answer) return Promise.reject(new InvalidReceiptError('reçu inconnu'));
    return Promise.resolve(answer);
  }
}

export async function insertSubscription(
  db: Database,
  userId: string,
  now: Date,
  options: { expiresAt: Date; status?: PurchaseStatus },
): Promise<string> {
  const id = newId();
  await db.insert(subscription).values({
    id,
    userId,
    store: 'google_play',
    purchaseKeyHash: createHash('sha256').update(id).digest(),
    productCode: 'premium_monthly',
    status: options.status ?? 'active',
    expiresAt: options.expiresAt,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
