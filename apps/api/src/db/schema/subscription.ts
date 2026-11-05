// Abonnements Premium vérifiés auprès des stores (F-ABO-01/03, ADR-040). Une ligne par achat de
// store, rattachée à un seul compte : la restauration sur un autre appareil du même compte met la
// ligne à jour ; le même achat présenté par un autre compte est refusé (409).
// Table de compte, non synchronisée (pas de `notebook_id`).
import { index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import type { PurchaseStatus, Store } from '../../subscriptions/store-receipt-verifier.js';
import { uuidBinary } from '../uuid.js';
import { primaryId, sha256Binary, timestamps, utcDateTime } from './columns.js';
import { user } from './user.js';

export const subscription = mysqlTable(
  'subscription',
  {
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    store: varchar('store', { length: 16 }).$type<Store>().notNull(),
    /** SHA-256 de la clé d'achat du store (`originalTransactionId` ou jeton Play), jamais en clair. */
    purchaseKeyHash: sha256Binary('purchase_key_hash').notNull(),
    productCode: varchar('product_code', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).$type<PurchaseStatus>().notNull(),
    /** Fin des droits payés selon le store (UTC). */
    expiresAt: utcDateTime('expires_at').notNull(),
    /** Dernière vérification auprès du store. */
    verifiedAt: utcDateTime('verified_at').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('subscription_purchase_uq').on(t.store, t.purchaseKeyHash),
    index('subscription_user_idx').on(t.userId, t.expiresAt),
  ],
);
