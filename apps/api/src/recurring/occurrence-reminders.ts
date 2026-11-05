// Rappels d'échéance J-3 et jour J (F-REC-04, ADR-034) : la tâche périodique
// `schedule-occurrence-reminders` met en file une tâche `notify` pour chaque échéance en attente
// dont le rappel (activé sur la récurrence) atteint l'heure de rappel du propriétaire du carnet,
// dans son fuseau (voir `reminder-time.ts`). Clé `occurrence-reminder:<id>:J-3|J` : un rappel de
// chaque sorte par échéance. Payée ou sautée avant l'heure du rappel : plus de rappel.
import { and, asc, eq, gt, gte, isNull, lte, or } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Clock } from '../clock.js';
import { notebook, occurrence, recurringExpense, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { JobQueue } from '../jobs/job-queue.js';
import { type ScheduledTask, ScheduledTaskError } from '../jobs/scheduler.js';
import { NOTIFY, type OCCURRENCE_REMINDERS } from '../notifications/notify-job.js';
import { localInstant, reminderDue } from '../notifications/reminder-time.js';
import { addDays } from './occurrence-generation.js';

const BATCH = 200;
const DAYS_BEFORE = 3;

type Reminder = (typeof OCCURRENCE_REMINDERS)[number];
const KEY_SUFFIX: Record<Reminder, string> = { three_days_before: 'J-3', due_date: 'J' };

interface Candidate {
  id: string;
  notebookId: string;
  dueDate: string;
  before: boolean;
  onDay: boolean;
  timeZone: string;
  time: string;
}

/** Tâche périodique : rappels d'échéance (voir l'en-tête). Renvoie le nombre mis en file. */
export function scheduleOccurrenceReminders(batchSize = BATCH): ScheduledTask {
  return {
    name: 'schedule-occurrence-reminders',
    async run(db, now) {
      const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
      const queue = new JobQueue({ now: () => now } satisfies Clock);
      // Jour local de UTC−12 à UTC+14 : entre la veille et le lendemain UTC ; le rappel peut viser
      // la veille (rattrapage après minuit). Échéances dont un rappel peut tomber : J-3 ou J.
      const utcToday = now.toISOString().slice(0, 10);
      const earliest = addDays(utcToday, -2);
      const latest = addDays(utcToday, 1 + DAYS_BEFORE);
      let after: Candidate | undefined;
      let total = 0;
      const failures: { id: string; error: unknown }[] = [];
      for (;;) {
        const rows: Candidate[] = await db
          .select({
            id: occurrence.id,
            notebookId: occurrence.notebookId,
            dueDate: occurrence.dueDate,
            before: recurringExpense.remindThreeDaysBefore,
            onDay: recurringExpense.remindOnDueDate,
            timeZone: user.timeZone,
            time: user.reminderTime,
          })
          .from(occurrence)
          .innerJoin(recurringExpense, eq(recurringExpense.id, occurrence.recurringExpenseId))
          .innerJoin(notebook, eq(notebook.id, occurrence.notebookId))
          .innerJoin(user, eq(user.id, notebook.ownerId))
          .where(
            and(
              eq(occurrence.status, 'pending'),
              gte(occurrence.dueDate, earliest),
              lte(occurrence.dueDate, latest),
              isNull(occurrence.deletedAt),
              isNull(recurringExpense.deletedAt),
              isNull(notebook.deletedAt),
              or(
                eq(recurringExpense.remindThreeDaysBefore, true),
                eq(recurringExpense.remindOnDueDate, true),
              ),
              after &&
                or(
                  gt(occurrence.dueDate, after.dueDate),
                  and(eq(occurrence.dueDate, after.dueDate), gt(occurrence.id, after.id)),
                ),
            ),
          )
          .orderBy(asc(occurrence.dueDate), asc(occurrence.id))
          .limit(batchSize);
        const due: { row: Candidate; reminder: Reminder }[] = [];
        for (const row of rows) {
          try {
            for (const reminder of dueReminders(row, instant)) due.push({ row, reminder });
          } catch (error) {
            failures.push({ id: row.id, error });
          }
        }
        if (due.length > 0) {
          await withTransaction(db, async (tx) => {
            for (const { row, reminder } of due) {
              const { created } = await queue.enqueue(
                tx,
                NOTIFY,
                {
                  kind: 'occurrence_reminder',
                  notebookId: row.notebookId,
                  occurrenceId: row.id,
                  reminder,
                },
                { uniqueKey: `occurrence-reminder:${row.id}:${KEY_SUFFIX[reminder]}` },
              );
              if (created) total++;
            }
          });
        }
        if (rows.length < batchSize) break;
        after = rows[rows.length - 1];
      }
      if (failures.length > 0) {
        throw new ScheduledTaskError(
          `${failures.length} rappel(s) d’échéance non planifié(s), dont ${failures[0]!.id}`,
          { failed: failures.length, occurrenceId: failures[0]!.id },
          { cause: failures[0]!.error },
        );
      }
      return total;
    },
  };
}

function dueReminders(row: Candidate, now: Temporal.Instant): Reminder[] {
  const at = (date: string) => reminderDue(localInstant(date, row.time, row.timeZone), now);
  const found: Reminder[] = [];
  if (row.before && at(addDays(row.dueDate, -DAYS_BEFORE))) found.push('three_days_before');
  if (row.onDay && at(row.dueDate)) found.push('due_date');
  return found;
}
