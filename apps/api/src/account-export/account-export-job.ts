// Tâche `account_export.generate` (F-AUTH-08, ADR-038) : rassemble les données du compte, écrit
// l'archive zip chiffrée sur le disque puis rend le lien valable 15 minutes. Idempotente : une
// demande déjà prête, en échec ou purgée est ignorée ; une reprise réécrit le fichier.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { accountExport } from '../db/schema/index.js';
import { EXPORT_LINK_TTL_MS, type ExportJobDeps } from '../exports/export-job.js';
import { defineJob } from '../jobs/job-queue.js';
import { type JobHandler, MAX_ATTEMPTS } from '../jobs/job-runner.js';
import { buildAccountArchive } from './archive.js';
import { collectPersonalData } from './personal-data.js';

export const GENERATE_ACCOUNT_EXPORT = defineJob(
  'account_export.generate',
  z.strictObject({ exportId: z.uuid() }),
);

export function generateAccountExportHandler(
  deps: ExportJobDeps,
): JobHandler<z.infer<typeof GENERATE_ACCOUNT_EXPORT.payload>> {
  return {
    definition: GENERATE_ACCOUNT_EXPORT,
    async handle({ exportId }, { attempt }) {
      try {
        await generate(deps, exportId);
      } catch (error) {
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
  if (!files) throw new Error('Stockage de fichiers non configuré');
  const [found] = await db
    .select({ userId: accountExport.userId, status: accountExport.status })
    .from(accountExport)
    .where(eq(accountExport.id, exportId));
  if (!found || found.status !== 'pending') return;
  const data = await collectPersonalData(db, found.userId);
  await files.write(exportId, buildAccountArchive(data, clock.now()));
  const ready = await finish(deps, exportId, {
    status: 'ready',
    expiresAt: new Date(clock.now().getTime() + EXPORT_LINK_TTL_MS),
  });
  if (ready) return;
  // Compte supprimé (cascade) pendant la génération : pas de fichier orphelin.
  const [still] = await db
    .select({ status: accountExport.status })
    .from(accountExport)
    .where(eq(accountExport.id, exportId));
  if (still?.status !== 'ready') await files.remove(exportId);
}

async function finish(
  { db, clock }: { db: Database; clock: Clock },
  exportId: string,
  values: Pick<typeof accountExport.$inferInsert, 'status' | 'expiresAt'>,
): Promise<boolean> {
  const [result] = await db
    .update(accountExport)
    .set({ ...values, updatedAt: clock.now() })
    .where(and(eq(accountExport.id, exportId), eq(accountExport.status, 'pending')));
  return result.affectedRows > 0;
}
