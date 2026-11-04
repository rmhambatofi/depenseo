// Comptes (§8.3, F-AUTH-01/07, F-ADM-03, NF-FMT-04).
import { char, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { primaryId, timestamps, utcDateTime } from './columns.js';

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const user = mysqlTable(
  'user',
  {
    id: primaryId(),
    email: varchar('email', { length: 254 }).notNull(),
    emailVerifiedAt: utcDateTime('email_verified_at'),
    /** argon2id ; NULL pour un compte créé par Apple/Google sans mot de passe. */
    passwordHash: varchar('password_hash', { length: 255 }),
    language: varchar('language', { length: 8 }).notNull().default('fr'),
    /** Fuseau IANA (ex. Europe/Paris), validé par l'API. */
    timeZone: varchar('time_zone', { length: 64 }).notNull().default('Europe/Paris'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    plan: varchar('plan', { length: 16 }).notNull().default('free'),
    /** Attribué par script uniquement (F-ADM-03). */
    role: varchar('role', { length: 16 }).$type<UserRole>().notNull().default('user'),
    /** Secret TOTP administrateur, chiffré par l'application. */
    adminTotpSecret: varchar('admin_totp_secret', { length: 255 }),
    termsAcceptedAt: utcDateTime('terms_accepted_at'),
    privacyAcceptedAt: utcDateTime('privacy_accepted_at'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('user_email_uq').on(t.email)],
);
