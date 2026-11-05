// Abonnements (F-ABO-01/02/03, ADR-040) : droits du compte, essai de 14 jours (une fois par compte)
// et vérification d'un achat auprès de son store. Un achat appartient au compte que l'application a
// transmis au store à l'achat (`accountRef`), à défaut au premier compte qui le présente : sa
// restauration sur un autre appareil du même compte met la ligne à jour ; présenté par un autre
// compte, il est refusé (409) sans rien révéler du titulaire.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { subscription, user } from '../db/schema/index.js';
import { ER_DUP_ENTRY, hasErrno, withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { type EntitlementState, loadEntitlements, type Plan, trialEnd } from './entitlements.js';
import {
  InvalidReceiptError,
  PREMIUM_PRODUCTS,
  type PurchaseProof,
  STORE_RECEIPT_VERIFIER,
  type StoreReceiptVerifier,
  StoreUnavailableError,
  type VerifiedPurchase,
} from './store-receipt-verifier.js';

export const verifyRequestSchema = z.discriminatedUnion('store', [
  z.strictObject({ store: z.literal('app_store'), transactionId: z.string().min(1).max(64) }),
  z.strictObject({ store: z.literal('google_play'), purchaseToken: z.string().min(1).max(2048) }),
]);

export interface EntitlementsView {
  plan: Plan;
  premiumUntil: string | null;
  trialEndsAt: string | null;
  trialAvailable: boolean;
}

const view = (state: EntitlementState): EntitlementsView => ({
  plan: state.plan,
  premiumUntil: state.premiumUntil?.toISOString() ?? null,
  trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
  trialAvailable: state.trialAvailable,
});

const purchaseKeyHash = (key: string) => createHash('sha256').update(key, 'utf8').digest();

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(STORE_RECEIPT_VERIFIER) private readonly verifier: StoreReceiptVerifier,
  ) {}

  async entitlements(userId: string): Promise<EntitlementsView> {
    return view(await loadEntitlements(this.db, userId, this.clock.now()));
  }

  /** Commence l'essai Premium ; 409 s'il a déjà été commencé (même expiré). */
  startTrial(userId: string): Promise<EntitlementsView> {
    return withTransaction(this.db, async (tx) => {
      const [account] = await tx
        .select({ timeZone: user.timeZone, trialEndsAt: user.trialEndsAt })
        .from(user)
        .where(eq(user.id, userId))
        .for('update');
      if (!account) throw new ProblemException(401, 'Session invalide ou expirée');
      if (account.trialEndsAt) throw new ProblemException(409, 'Essai Premium déjà utilisé');
      const now = this.clock.now();
      await tx
        .update(user)
        .set({ trialEndsAt: trialEnd(now, account.timeZone), updatedAt: now })
        .where(eq(user.id, userId));
      return view(await loadEntitlements(tx, userId, now));
    });
  }

  /** Vérifie l'achat auprès du store puis le rattache au compte (achat ou restauration). */
  async verify(userId: string, proof: PurchaseProof): Promise<EntitlementsView> {
    let purchase: VerifiedPurchase;
    try {
      purchase = await this.verifier.verify(proof);
    } catch (error) {
      if (error instanceof InvalidReceiptError) throw new ProblemException(400, 'Reçu invalide');
      if (error instanceof StoreUnavailableError) {
        throw new ProblemException(503, 'Vérification par le store indisponible');
      }
      throw error;
    }
    if (purchase.store !== proof.store || !PREMIUM_PRODUCTS.includes(purchase.productCode)) {
      throw new ProblemException(400, 'Reçu invalide');
    }
    // Achat fait depuis un autre compte (identifiant de compte transmis au store par l'application).
    if (purchase.accountRef !== undefined && purchase.accountRef !== userId) {
      throw new ProblemException(409, 'Achat déjà rattaché à un autre compte');
    }
    try {
      return await this.record(userId, purchase);
    } catch (error) {
      // Deux appareils du compte restaurent le même achat en même temps : la ligne existe désormais.
      if (hasErrno(error, ER_DUP_ENTRY)) return this.record(userId, purchase);
      throw error;
    }
  }

  private record(userId: string, purchase: VerifiedPurchase): Promise<EntitlementsView> {
    return withTransaction(this.db, async (tx) => {
      const now = this.clock.now();
      const hash = purchaseKeyHash(purchase.purchaseKey);
      const fields = {
        productCode: purchase.productCode,
        status: purchase.status,
        expiresAt: purchase.expiresAt,
        verifiedAt: now,
        updatedAt: now,
      };
      const [existing] = await tx
        .select({ id: subscription.id, userId: subscription.userId })
        .from(subscription)
        .where(and(eq(subscription.store, purchase.store), eq(subscription.purchaseKeyHash, hash)))
        .for('update');
      if (existing && existing.userId !== userId) {
        throw new ProblemException(409, 'Achat déjà rattaché à un autre compte');
      }
      if (existing) {
        await tx.update(subscription).set(fields).where(eq(subscription.id, existing.id));
      } else {
        await tx.insert(subscription).values({
          id: newId(),
          userId,
          store: purchase.store,
          purchaseKeyHash: hash,
          ...fields,
          createdAt: now,
        });
      }
      return view(await loadEntitlements(tx, userId, now));
    });
  }
}
