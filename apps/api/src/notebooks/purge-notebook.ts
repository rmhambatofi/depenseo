// Suppression physique d'un carnet (P4-06 `DELETE /me`, ADR-024). Les FK `expense.category_id` et
// `expense_tag.tag_id` sont sans cascade (une purge de catégorie ou d'étiquette ne doit jamais
// effacer une dépense en silence) : les dépenses partent donc d'abord, puis la cascade
// `notebook → category, tag, …` fait le reste.
import { eq } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import {
  expense,
  notebook,
  occurrence,
  recurringExpense,
  spendingLimit,
} from '../db/schema/index.js';

export async function purgeNotebook(tx: Tx, notebookId: string): Promise<void> {
  // Échéances (FK vers la dépense) puis récurrences (FK catégorie sans cascade) avant les dépenses.
  await tx.delete(occurrence).where(eq(occurrence.notebookId, notebookId));
  await tx.delete(recurringExpense).where(eq(recurringExpense.notebookId, notebookId));
  await tx.delete(expense).where(eq(expense.notebookId, notebookId));
  // `spending_limit.category_id` est sans cascade : la cascade vers `category` échouerait (1451).
  await tx.delete(spendingLimit).where(eq(spendingLimit.notebookId, notebookId));
  await tx.delete(notebook).where(eq(notebook.id, notebookId));
}
