// Échéances dues (F-REC-02, ADR-033) : la tâche périodique `process-due-occurrences` traite chaque
// échéance en attente dont la date est atteinte dans le fuseau du propriétaire du carnet.
// Mode auto → dépense `source = recurrence` (échéance payée) ; mode confirmation → échéance « à
// confirmer » (`confirmation_requested_at`) + tâche `notify` (clé `occurrence-due:<id>`). Une échéance
// n'est traitée qu'une fois : verrou du carnet puis relecture du statut, dans une transaction.
import { todayIn } from '@depenseo/shared';
import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Tx } from '../auth/session.service.js';
import type { Clock } from '../clock.js';
import { notebook, occurrence, recurringExpense, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { JobQueue } from '../jobs/job-queue.js';
import { type ScheduledTask, ScheduledTaskError } from '../jobs/scheduler.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import { NOTIFY } from '../notifications/notify-job.js';
import { addDays } from './occurrence-generation.js';
import { findOccurrence, payOccurrence } from './occurrences.service.js';
import { assertValidCategory } from './recurring.service.js';

const DUE_BATCH = 100;

interface Candidate {
  id: string;
  notebookId: string;
  dueDate: string;
  ownerId: string;
  timeZone: string;
}

/** Tâche périodique : traite les échéances dues (voir l'en-tête). Renvoie le nombre traité. */
export function processDueOccurrences(batchSize = DUE_BATCH): ScheduledTask {
  return {
    name: 'process-due-occurrences',
    async run(db, now) {
      const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
      // Fuseaux de UTC−12 à UTC+14 : aucune échéance n'est due au-delà du lendemain UTC.
      const latest = addDays(now.toISOString().slice(0, 10), 1);
      const clock: Clock = { now: () => now };
      let after: Candidate | undefined;
      let total = 0;
      const failures: { id: string; error: unknown }[] = [];
      for (;;) {
        // Pagination par (date, id) : les échéances pas encore dues dans leur fuseau restent en
        // attente et ne doivent pas être relues indéfiniment.
        const rows: Candidate[] = await db
          .select({
            id: occurrence.id,
            notebookId: occurrence.notebookId,
            dueDate: occurrence.dueDate,
            ownerId: notebook.ownerId,
            timeZone: user.timeZone,
          })
          .from(occurrence)
          .innerJoin(recurringExpense, eq(recurringExpense.id, occurrence.recurringExpenseId))
          .innerJoin(notebook, eq(notebook.id, occurrence.notebookId))
          .innerJoin(user, eq(user.id, notebook.ownerId))
          .where(
            and(
              eq(occurrence.status, 'pending'),
              isNull(occurrence.confirmationRequestedAt),
              lte(occurrence.dueDate, latest),
              isNull(occurrence.deletedAt),
              isNull(recurringExpense.deletedAt),
              isNull(notebook.deletedAt),
              after &&
                or(
                  gt(occurrence.dueDate, after.dueDate),
                  and(eq(occurrence.dueDate, after.dueDate), gt(occurrence.id, after.id)),
                ),
            ),
          )
          .orderBy(asc(occurrence.dueDate), asc(occurrence.id))
          .limit(batchSize);
        for (const row of rows) {
          // Une échéance en échec (fuseau invalide, erreur durable) ne doit pas bloquer les
          // autres : on continue, puis on signale l'échec en fin de passage (identifiants seuls).
          try {
            if (row.dueDate > todayIn(row.timeZone, instant).toString()) continue;
            if (await withTransaction(db, (tx) => processOne(tx, clock, row))) total++;
          } catch (error) {
            failures.push({ id: row.id, error });
          }
        }
        if (rows.length < batchSize) break;
        after = rows[rows.length - 1];
      }
      if (failures.length > 0) {
        throw new ScheduledTaskError(
          `${failures.length} échéance(s) due(s) non traitée(s), dont ${failures[0]!.id}`,
          { failed: failures.length, occurrenceId: failures[0]!.id },
          { cause: failures[0]!.error },
        );
      }
      return total;
    },
  };
}

/** Traite une échéance sous verrou du carnet ; `false` si elle l'a déjà été entre-temps. */
async function processOne(tx: Tx, clock: Clock, row: Candidate): Promise<boolean> {
  await lockNotebook(tx, row.notebookId);
  const found = await findOccurrence(tx, row.notebookId, row.id);
  if (!found || found.status !== 'pending' || found.awaitingConfirmation) return false;
  const [rec] = await tx
    .select({ mode: recurringExpense.mode })
    .from(recurringExpense)
    .where(
      and(eq(recurringExpense.id, found.recurringExpenseId), isNull(recurringExpense.deletedAt)),
    );
  if (!rec) return false;

  if (rec.mode === 'auto' && (await categoryUsable(tx, row.notebookId, found.categoryId))) {
    await payOccurrence(tx, clock, row.notebookId, row.ownerId, found, { expenseId: newId() });
    return true;
  }
  // Mode confirmation (ou catégorie devenue inutilisable : on demande à l'utilisateur).
  const now = clock.now();
  await tx
    .update(occurrence)
    .set({ confirmationRequestedAt: now, updatedAt: now })
    .where(eq(occurrence.id, found.id));
  await new JobQueue(clock).enqueue(
    tx,
    NOTIFY,
    { kind: 'occurrence_due', notebookId: row.notebookId, occurrenceId: found.id },
    { uniqueKey: `occurrence-due:${found.id}` },
  );
  return true;
}

async function categoryUsable(tx: Tx, notebookId: string, categoryId: string): Promise<boolean> {
  try {
    await assertValidCategory(tx, notebookId, categoryId);
    return true;
  } catch (error) {
    if (error instanceof ProblemException) return false;
    throw error;
  }
}
