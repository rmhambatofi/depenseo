// Identités Apple / Google rattachées à un compte (F-AUTH-02, ADR-020). Le compte est retrouvé par
// le couple (fournisseur, `sub` du jeton), stable même si l'adresse change chez le fournisseur.
import { index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, sha256Binary, utcDateTime } from './columns.js';
import { user } from './user.js';

export const IDENTITY_PROVIDERS = ['apple', 'google'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const userIdentity = mysqlTable(
  'user_identity',
  {
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 16 }).$type<IdentityProvider>().notNull(),
    /**
     * SHA-256 du claim `sub` (opaque, sensible à la casse, ≤ 255 caractères selon OIDC Core §2) :
     * comparaison exacte, que la collation utf8mb4_unicode_520_ci ne garantirait pas.
     */
    subjectHash: sha256Binary('subject_hash').notNull(),
    createdAt: utcDateTime('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('user_identity_subject_uq').on(t.provider, t.subjectHash),
    index('user_identity_user_idx').on(t.userId),
  ],
);
