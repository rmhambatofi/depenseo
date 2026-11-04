// Jetons d'authentification (NF-SEC-02, F-AUTH-01/03) : seul le SHA-256 du jeton est stocké.
import { index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, sha256Binary, utcDateTime } from './columns.js';
import { user } from './user.js';

const tokenHash = () => sha256Binary('token_hash').notNull();

export const refreshToken = mysqlTable(
  'refresh_token',
  {
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Famille de rotation : une réutilisation révoque toute la famille (P1-06). */
    familyId: uuidBinary('family_id').notNull(),
    tokenHash: tokenHash(),
    expiresAt: utcDateTime('expires_at').notNull(),
    /** Renseigné quand le jeton a été échangé (rotation). */
    usedAt: utcDateTime('used_at'),
    revokedAt: utcDateTime('revoked_at'),
    createdAt: utcDateTime('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('refresh_token_hash_uq').on(t.tokenHash),
    index('refresh_token_family_idx').on(t.familyId),
    index('refresh_token_user_idx').on(t.userId),
    /** Purge périodique des jetons expirés (ADR-018). */
    index('refresh_token_expires_idx').on(t.expiresAt),
  ],
);

export const EMAIL_TOKEN_PURPOSES = ['verify_email', 'reset_password'] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

export const emailToken = mysqlTable(
  'email_token',
  {
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    purpose: varchar('purpose', { length: 16 }).$type<EmailTokenPurpose>().notNull(),
    tokenHash: tokenHash(),
    expiresAt: utcDateTime('expires_at').notNull(),
    /** Usage unique : renseigné à la consommation. */
    consumedAt: utcDateTime('consumed_at'),
    createdAt: utcDateTime('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('email_token_hash_uq').on(t.tokenHash),
    index('email_token_user_idx').on(t.userId, t.purpose),
  ],
);
