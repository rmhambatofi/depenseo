// Matérialisation des échéances (F-REC-01, ADR-032) : chaque récurrence porte ses échéances
// jusqu'à un horizon glissant de `HORIZON_DAYS` jours, et toujours au moins sa prochaine échéance
// (trimestrielle, annuelle). La tâche périodique `generate-occurrences` fait avancer l'horizon ; une
// échéance n'est jamais créée deux fois (index unique (récurrence, date)).
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Tx } from '../auth/session.service.js';
import { occurrence, recurringExpense } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import type { ScheduledTask } from '../jobs/scheduler.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import { dueDates, nextDueDate, type Schedule } from './schedule.js';

/** Horizon de matérialisation, en jours après aujourd'hui. */
export const HORIZON_DAYS = 40;
/** Récurrence épuisée (ponctuelle passée) : plus rien à générer. */
export const EXHAUSTED = '9999-12-31';
const GENERATION_BATCH = 100;

export const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();

/**
 * Crée les échéances de [`from`, `through`] (ou la prochaine après `from` si la fenêtre est vide)
 * et renvoie la nouvelle valeur de `generated_through`. À appeler sous verrou de la récurrence.
 */
export async function generateOccurrences(
  tx: Tx,
  rec: Schedule & { id: string; notebookId: string },
  from: string,
  through: string,
  now: Date,
): Promise<string> {
  let dates = dueDates(rec, from, through);
  let until = through;
  if (dates.length === 0) {
    const next = nextDueDate(rec, from);
    if (next === undefined) return EXHAUSTED;
    [dates, until] = [[next], next];
  }
  await tx
    .insert(occurrence)
    .values(
      dates.map((dueDate) => ({
        id: newId(),
        notebookId: rec.notebookId,
        recurringExpenseId: rec.id,
        dueDate,
        status: 'pending' as const,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onDuplicateKeyUpdate({ set: { id: sql`${occurrence.id}` } });
  return until;
}

/**
 * Tâche périodique : avance l'horizon des récurrences actives. Aujourd'hui = date UTC ; l'écart
 * avec le fuseau du compte (± 1 jour) est absorbé par l'horizon de 40 jours.
 */
export function generateDueOccurrences(batchSize = GENERATION_BATCH): ScheduledTask {
  return {
    name: 'generate-occurrences',
    async run(db, now) {
      const horizon = addDays(now.toISOString().slice(0, 10), HORIZON_DAYS);
      let total = 0;
      for (;;) {
        const ids = await db
          .select({ id: recurringExpense.id, notebookId: recurringExpense.notebookId })
          .from(recurringExpense)
          .where(
            and(isNull(recurringExpense.deletedAt), lt(recurringExpense.generatedThrough, horizon)),
          )
          .orderBy(asc(recurringExpense.generatedThrough))
          .limit(batchSize);
        for (const { id, notebookId } of ids) {
          await withTransaction(db, async (tx) => {
            // Même ordre de verrous que les services : carnet, puis récurrence.
            await lockNotebook(tx, notebookId);
            const [rec] = await tx
              .select({
                id: recurringExpense.id,
                notebookId: recurringExpense.notebookId,
                frequency: recurringExpense.frequency,
                startDate: recurringExpense.startDate,
                generatedThrough: recurringExpense.generatedThrough,
              })
              .from(recurringExpense)
              .where(and(eq(recurringExpense.id, id), isNull(recurringExpense.deletedAt)))
              .for('update');
            if (!rec || rec.generatedThrough >= horizon) return;
            const from = addDays(rec.generatedThrough, 1);
            const until = await generateOccurrences(tx, rec, from, horizon, now);
            await tx
              .update(recurringExpense)
              .set({ generatedThrough: until })
              .where(eq(recurringExpense.id, id));
          });
          total++;
        }
        if (ids.length < batchSize) return total;
      }
    },
  };
}
