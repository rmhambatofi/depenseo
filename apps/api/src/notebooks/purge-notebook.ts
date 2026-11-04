// Suppression physique d'un carnet (P4-06 `DELETE /me`, ADR-024). Les FK `expense.category_id` et
// `expense_tag.tag_id` sont sans cascade (une purge de catégorie ou d'étiquette ne doit jamais
// effacer une dépense en silence) : les dépenses partent donc d'abord, puis la cascade
// `notebook → category, tag, …` fait le reste.
import { eq } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import { expense, notebook } from '../db/schema/index.js';

export async function purgeNotebook(tx: Tx, notebookId: string): Promise<void> {
  await tx.delete(expense).where(eq(expense.notebookId, notebookId));
  await tx.delete(notebook).where(eq(notebook.id, notebookId));
}
