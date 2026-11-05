// Rappel quotidien de saisie (F-NOT-02, ADR-034) : la tâche périodique `schedule-daily-reminders`
// met en file une tâche `notify` pour chaque compte dont l'heure choisie (`daily_reminder_time`) est
// atteinte dans son fuseau (voir `reminder-time.ts`). Clé `daily-reminder:<compte>:<jour local>` :
// un rappel par jour local, même si le cron repasse ou si l'heure est modifiée dans la journée.
import { todayIn } from '@depenseo/shared';
import { and, asc, gt, isNotNull } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Clock } from '../clock.js';
import { user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { JobQueue } from '../jobs/job-queue.js';
import { type ScheduledTask, ScheduledTaskError } from '../jobs/scheduler.js';
import { NOTIFY } from './notify-job.js';
import { localInstant, reminderDue } from './reminder-time.js';

const BATCH = 500;

/** Tâche périodique : rappels quotidiens de saisie (voir l'en-tête). Renvoie le nombre mis en file. */
export function scheduleDailyReminders(batchSize = BATCH): ScheduledTask {
  return {
    name: 'schedule-daily-reminders',
    async run(db, now) {
      const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
      const queue = new JobQueue({ now: () => now } satisfies Clock);
      let after: string | undefined;
      let total = 0;
      const failures: { id: string; error: unknown }[] = [];
      for (;;) {
        const rows = await db
          .select({ id: user.id, timeZone: user.timeZone, time: user.dailyReminderTime })
          .from(user)
          .where(and(isNotNull(user.dailyReminderTime), after ? gt(user.id, after) : undefined))
          .orderBy(asc(user.id))
          .limit(batchSize);
        const due: { userId: string; date: string }[] = [];
        for (const row of rows) {
          try {
            const date = dueDate(row.time!, row.timeZone, instant);
            if (date) due.push({ userId: row.id, date });
          } catch (error) {
            failures.push({ id: row.id, error });
          }
        }
        if (due.length > 0) {
          await withTransaction(db, async (tx) => {
            for (const { userId, date } of due) {
              const { created } = await queue.enqueue(
                tx,
                NOTIFY,
                { kind: 'daily_reminder', userId, date },
                { uniqueKey: `daily-reminder:${userId}:${date}` },
              );
              if (created) total++;
            }
          });
        }
        if (rows.length < batchSize) break;
        after = rows[rows.length - 1]!.id;
      }
      if (failures.length > 0) {
        throw new ScheduledTaskError(
          `${failures.length} rappel(s) quotidien(s) non planifié(s), dont ${failures[0]!.id}`,
          { failed: failures.length, userId: failures[0]!.id },
          { cause: failures[0]!.error },
        );
      }
      return total;
    },
  };
}

/** Jour local dont le rappel est dû à `now` (aujourd'hui ou, juste après minuit, la veille). */
function dueDate(time: string, timeZone: string, now: Temporal.Instant): string | undefined {
  const today = todayIn(timeZone, now);
  for (const day of [today, today.subtract({ days: 1 })]) {
    if (reminderDue(localInstant(day.toString(), time, timeZone), now)) return day.toString();
  }
  return undefined;
}
