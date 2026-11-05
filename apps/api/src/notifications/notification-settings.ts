// Réglages de notification d'un compte (F-NOT-04, ADR-035) : un interrupteur par type et une plage
// de silence facultative. Sans ligne `notification_setting` : tout activé, aucune plage.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { type NotificationType, notificationSetting } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';
import type { NOTIFY } from './notify-job.js';
import type { QuietHours } from './quiet-hours.js';
import { localTime } from './reminder-time.js';

export interface NotificationSettings extends Record<NotificationType, boolean> {
  quietHours: QuietHours | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  limit: true,
  occurrence: true,
  unusualExpense: true,
  dailyReminder: true,
  quietHours: null,
};

/** Type réglable dont relève une tâche `notify`. */
export function notificationType(kind: z.infer<typeof NOTIFY.payload>['kind']): NotificationType {
  switch (kind) {
    case 'limit':
      return 'limit';
    case 'unusual_expense':
      return 'unusualExpense';
    case 'occurrence_due':
    case 'occurrence_reminder':
      return 'occurrence';
    case 'daily_reminder':
      return 'dailyReminder';
  }
}

export const notificationSettingsPatchSchema = z
  .strictObject({
    limit: z.boolean().optional(),
    occurrence: z.boolean().optional(),
    unusualExpense: z.boolean().optional(),
    dailyReminder: z.boolean().optional(),
    /** `null` = aucune plage ; début et fin distincts, fin exclue, à cheval sur minuit permis. */
    quietHours: z
      .strictObject({ start: localTime, end: localTime })
      .refine((q) => q.start !== q.end, 'Début et fin de plage identiques')
      .nullable()
      .optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Au moins un réglage attendu');

export type NotificationSettingsPatch = z.infer<typeof notificationSettingsPatchSchema>;

type Executor = Pick<Database, 'select'>;

export async function loadNotificationSettings(
  db: Executor,
  userId: string,
): Promise<NotificationSettings> {
  const [row] = await db
    .select()
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, userId));
  if (!row) return DEFAULT_NOTIFICATION_SETTINGS;
  return {
    limit: row.limitEnabled,
    occurrence: row.occurrenceEnabled,
    unusualExpense: row.unusualExpenseEnabled,
    dailyReminder: row.dailyReminderEnabled,
    quietHours:
      row.quietStart && row.quietEnd ? { start: row.quietStart, end: row.quietEnd } : null,
  };
}

/** Applique `patch` (ligne créée au premier réglage) et renvoie les réglages obtenus. */
export async function updateNotificationSettings(
  db: Database,
  userId: string,
  patch: NotificationSettingsPatch,
  now: Date,
): Promise<NotificationSettings> {
  const columns = {
    ...(patch.limit !== undefined && { limitEnabled: patch.limit }),
    ...(patch.occurrence !== undefined && { occurrenceEnabled: patch.occurrence }),
    ...(patch.unusualExpense !== undefined && { unusualExpenseEnabled: patch.unusualExpense }),
    ...(patch.dailyReminder !== undefined && { dailyReminderEnabled: patch.dailyReminder }),
    ...(patch.quietHours !== undefined && {
      quietStart: patch.quietHours?.start ?? null,
      quietEnd: patch.quietHours?.end ?? null,
    }),
  };
  await db
    .insert(notificationSetting)
    .values({ id: newId(), userId, ...columns, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { ...columns, updatedAt: now } });
  return loadNotificationSettings(db, userId);
}
