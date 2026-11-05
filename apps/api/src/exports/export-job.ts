// Tâche `export.generate` (F-EXP-01, ADR-036) : produit le fichier d'un export demandé, le chiffre
// sur le disque puis rend le lien valable 15 minutes. Idempotente : un export déjà prêt, en échec
// ou purgé est ignoré ; un fichier réécrit par une reprise remplace le précédent (même contenu).
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { exportFile, notebook, user } from '../db/schema/index.js';
import { defineJob } from '../jobs/job-queue.js';
import { type JobHandler, MAX_ATTEMPTS } from '../jobs/job-runner.js';
import { buildCsv } from './csv.js';
import { exportLanguage } from './export-format.js';
import { loadExportRows } from './export-rows.js';
import type { EncryptedFileStore } from './file-store.js';
import { buildXlsx } from './xlsx.js';

/** Durée de validité du lien de téléchargement une fois le fichier prêt. */
export const EXPORT_LINK_TTL_MS = 15 * 60_000;

export const GENERATE_EXPORT = defineJob('export.generate', z.strictObject({ exportId: z.uuid() }));

export interface ExportJobDeps {
  db: Database;
  clock: Clock;
  /** Absent si FILE_STORAGE_DIR / FILE_ENCRYPTION_KEY ne sont pas configurées. */
  files?: EncryptedFileStore | undefined;
}

export function generateExportHandler(
  deps: ExportJobDeps,
): JobHandler<z.infer<typeof GENERATE_EXPORT.payload>> {
  return {
    definition: GENERATE_EXPORT,
    async handle({ exportId }, { attempt }) {
      try {
        await generate(deps, exportId);
      } catch (error) {
        // Dernier essai : l'export passe en échec (le client peut relancer), puis la file
        // enregistre l'échec de la tâche pour diagnostic.
        if (attempt >= MAX_ATTEMPTS) {
          await finish(deps, exportId, { status: 'failed', expiresAt: null });
        }
        throw error;
      }
    },
  };
}

async function generate(deps: ExportJobDeps, exportId: string): Promise<void> {
  const { db, clock, files } = deps;
  // Erreur sans donnée : la tâche est retentée puis passe en échec (diagnostic par la file).
  if (!files) throw new Error('Stockage de fichiers non configuré');
  const [found] = await db
    .select({
      notebookId: exportFile.notebookId,
      format: exportFile.format,
      dateFrom: exportFile.dateFrom,
      dateTo: exportFile.dateTo,
      status: exportFile.status,
      language: user.language,
      notebookDeletedAt: notebook.deletedAt,
    })
    .from(exportFile)
    .innerJoin(user, eq(user.id, exportFile.userId))
    .innerJoin(notebook, eq(notebook.id, exportFile.notebookId))
    .where(and(eq(exportFile.id, exportId), isNull(exportFile.deletedAt)));
  if (!found || found.status !== 'pending') return;
  if (found.notebookDeletedAt !== null) {
    await finish(deps, exportId, { status: 'failed', expiresAt: null });
    return;
  }
  const rows = await loadExportRows(db, found.notebookId, found.dateFrom, found.dateTo);
  const language = exportLanguage(found.language);
  const content = found.format === 'xlsx' ? buildXlsx(rows, language) : buildCsv(rows, language);
  await files.write(exportId, content);
  const ready = await finish(deps, exportId, {
    status: 'ready',
    expiresAt: new Date(clock.now().getTime() + EXPORT_LINK_TTL_MS),
  });
  if (ready) return;
  // Ligne purgée ou supprimée (cascade) pendant la génération : pas de fichier orphelin. Une
  // exécution concurrente qui l'a déjà rendue prête garde son fichier (contenu identique).
  const [still] = await db
    .select({ status: exportFile.status })
    .from(exportFile)
    .where(eq(exportFile.id, exportId));
  if (still?.status !== 'ready') await files.remove(exportId);
}

/** Clôt un export encore en attente ; `false` si la ligne n'est plus en attente (ou absente). */
async function finish(
  { db, clock }: ExportJobDeps,
  exportId: string,
  values: Pick<typeof exportFile.$inferInsert, 'status' | 'expiresAt'>,
): Promise<boolean> {
  const [result] = await db
    .update(exportFile)
    .set({ ...values, updatedAt: clock.now() })
    .where(and(eq(exportFile.id, exportId), eq(exportFile.status, 'pending')));
  return result.affectedRows > 0;
}
