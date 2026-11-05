// Comptes (§8.3, F-AUTH-01/07, F-ADM-03, NF-FMT-04).
import { bigint, char, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
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
    /** Heure locale `HH:MM` des rappels d'échéance J-3 et jour J (F-REC-04, ADR-034). */
    reminderTime: char('reminder_time', { length: 5 }).notNull().default('09:00'),
    /** Heure locale `HH:MM` du rappel quotidien de saisie ; NULL = désactivé (F-NOT-02). */
    dailyReminderTime: char('daily_reminder_time', { length: 5 }),
    /**
     * Fin de l'essai Premium de 14 jours (F-ABO-02, ADR-040) : minuit local au début du 15e jour.
     * NULL = essai jamais commencé ; renseignée = essai consommé (une fois par compte).
     */
    trialEndsAt: utcDateTime('trial_ends_at'),
    /** Attribué par script uniquement (F-ADM-03). */
    role: varchar('role', { length: 16 }).$type<UserRole>().notNull().default('user'),
    /** Secret TOTP administrateur, chiffré par l'application. */
    adminTotpSecret: varchar('admin_totp_secret', { length: 255 }),
    /**
     * Dernier pas TOTP (fenêtre de 30 s depuis l'époque Unix) accepté à la connexion admin : un code
     * déjà utilisé, ou plus ancien, est refusé (rejeu, ADR-042).
     */
    adminTotpLastStep: bigint('admin_totp_last_step', { mode: 'number' }),
    termsAcceptedAt: utcDateTime('terms_accepted_at'),
    privacyAcceptedAt: utcDateTime('privacy_accepted_at'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('user_email_uq').on(t.email)],
);
