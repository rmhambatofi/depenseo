// Appareils joignables par notification push et réglages de notification (F-NOT-01, F-NOT-04,
// ADR-035). Données de compte, non synchronisées : ni `notebook_id` ni index de synchronisation.
import { boolean, char, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, sha256Binary, timestamps } from './columns.js';
import { user } from './user.js';

export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Longueur maximale d'un jeton APNs (64 hex) ou FCM (~160 car.), avec marge. */
export const PUSH_TOKEN_MAX_LENGTH = 512;

export const device = mysqlTable(
  'device',
  {
    /** UUID v7 généré par l'application mobile à l'installation. */
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 8 }).$type<PushPlatform>().notNull(),
    /** Jeton du service push (APNs ou FCM). Jamais journalisé. */
    pushToken: varchar('push_token', { length: PUSH_TOKEN_MAX_LENGTH }).notNull(),
    /** SHA-256 du jeton : unicité sensible à la casse (la collation de `push_token` ne l'est pas). */
    pushTokenHash: sha256Binary('push_token_hash').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('device_push_token_uq').on(t.pushTokenHash),
    index('device_user_idx').on(t.userId),
  ],
);

/** Types de notification réglables (F-NOT-04). `occurrence` couvre échéances et rappels J-3 / J. */
export const NOTIFICATION_TYPES = [
  'limit',
  'occurrence',
  'unusualExpense',
  'dailyReminder',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Réglages d'un compte ; absence de ligne = tout activé, pas de plage de silence. */
export const notificationSetting = mysqlTable(
  'notification_setting',
  {
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    limitEnabled: boolean('limit_enabled').notNull().default(true),
    occurrenceEnabled: boolean('occurrence_enabled').notNull().default(true),
    unusualExpenseEnabled: boolean('unusual_expense_enabled').notNull().default(true),
    dailyReminderEnabled: boolean('daily_reminder_enabled').notNull().default(true),
    /** Plage de silence en heures locales `HH:MM` (fin exclue) ; les deux NULL = aucune. */
    quietStart: char('quiet_start', { length: 5 }),
    quietEnd: char('quiet_end', { length: 5 }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('notification_setting_user_uq').on(t.userId)],
);
