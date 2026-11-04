// Dépense inhabituellement élevée (F-NOT-01, ADR-005, ADR-030) : à la création d'une dépense,
// dans la transaction d'écriture (carnet verrouillé), son montant est comparé à la médiane des
// dépenses de la même catégorie racine et de la même devise sur les 90 jours qui précèdent sa date
// (bornes incluses). Une tâche `notify` est créée sans aucun montant (ADR-003), une fois par dépense.
import { and, between, eq, isNull, ne, or } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Tx } from '../auth/session.service.js';
import type { Clock } from '../clock.js';
import { category, expense } from '../db/schema/index.js';
import { JobQueue } from '../jobs/job-queue.js';
import { NOTIFY } from '../notifications/notify-job.js';

/** Paramètres d'ADR-005. */
export const UNUSUAL_FACTOR = 3;
export const UNUSUAL_MIN_HISTORY = 5;
/** Plancher en unités mineures de la devise de la dépense (20 € ; pas de conversion, ADR-030). */
export const UNUSUAL_MIN_AMOUNT = 2_000;
export const UNUSUAL_WINDOW_DAYS = 90;

/**
 * Vrai si `amount` ≥ 3 × médiane de `history` (au moins 5 valeurs) et ≥ 2 000. Calcul entier : une
 * médiane paire (a + b) / 2 est comparée par 2 × amount ≥ 3 × (a + b), sans arrondi.
 */
export function isUnusualAmount(amount: number, history: readonly number[]): boolean {
  if (amount < UNUSUAL_MIN_AMOUNT || history.length < UNUSUAL_MIN_HISTORY) return false;
  const sorted = [...history].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? amount >= UNUSUAL_FACTOR * sorted[mid]!
    : 2 * amount >= UNUSUAL_FACTOR * (sorted[mid - 1]! + sorted[mid]!);
}

/** Premier jour de l'historique (J−90) : arithmétique calendaire pure, sans fuseau ni heure. */
export function historyStart(spentOn: string): string {
  return Temporal.PlainDate.from(spentOn).subtract({ days: UNUSUAL_WINDOW_DAYS }).toString();
}

export interface CreatedExpense {
  notebookId: string;
  expenseId: string;
  categoryId: string;
  amount: number;
  currency: string;
  /** Date de la dépense, AAAA-MM-JJ. */
  spentOn: string;
}

/**
 * Crée la tâche `notify` (clé `unusual:<dépense>`) si la dépense est inhabituelle. L'appelant tient
 * le verrou du carnet et vient d'insérer la dépense, exclue de son propre historique.
 */
export async function checkUnusualExpense(
  tx: Tx,
  clock: Clock,
  created: CreatedExpense,
): Promise<boolean> {
  const { notebookId, expenseId, amount, currency, spentOn } = created;
  if (amount < UNUSUAL_MIN_AMOUNT) return false;
  const [own] = await tx
    .select({ parentId: category.parentId })
    .from(category)
    .where(and(eq(category.id, created.categoryId), eq(category.notebookId, notebookId)));
  if (!own) return false;
  const root = own.parentId ?? created.categoryId;
  const from = historyStart(spentOn);
  const rows = await tx
    .select({ amount: expense.amount })
    .from(expense)
    .innerJoin(category, eq(category.id, expense.categoryId))
    .where(
      and(
        eq(expense.notebookId, notebookId),
        between(expense.spentOn, from, spentOn),
        eq(expense.currency, currency),
        isNull(expense.deletedAt),
        ne(expense.id, expenseId),
        eq(category.notebookId, notebookId),
        or(eq(category.id, root), eq(category.parentId, root)),
      ),
    );
  const history = rows.map((r) => r.amount);
  if (!isUnusualAmount(amount, history)) return false;
  await new JobQueue(clock).enqueue(
    tx,
    NOTIFY,
    { kind: 'unusual_expense', notebookId, expenseId },
    { uniqueKey: `unusual:${expenseId}` },
  );
  return true;
}
