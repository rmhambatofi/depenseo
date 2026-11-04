// Verrou exclusif sur la ligne `notebook` : sérialise les écritures d'un carnet (hiérarchie des
// catégories, validité de la catégorie d'une dépense, création des étiquettes).
import { eq } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import { notebook } from '../db/schema/index.js';

export async function lockNotebook(tx: Tx, notebookId: string): Promise<void> {
  await tx
    .select({ id: notebook.id })
    .from(notebook)
    .where(eq(notebook.id, notebookId))
    .for('update');
}
