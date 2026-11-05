// Purge des exports (ADR-036) : fichier puis ligne, dès l'expiration du lien ; demandes restées en
// attente ou en échec depuis plus d'un jour (tâche abandonnée). Le fichier est effacé avant la
// ligne : une ligne sans fichier se repurge, un fichier sans ligne ne serait plus jamais retrouvé.
// Exports de dépenses (`export_file`) et exports RGPD du compte (`account_export`, ADR-038).
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { accountExport, exportFile } from '../db/schema/index.js';
import { PURGE_BATCH, type ScheduledTask } from '../jobs/scheduler.js';
import type { EncryptedFileStore } from './file-store.js';

export const ABANDONED_EXPORT_MS = 24 * 3_600_000;

export function purgeExpiredExports(
  files: EncryptedFileStore,
  batchSize = PURGE_BATCH,
): ScheduledTask {
  return {
    name: 'purge-expired-exports',
    async run(db, now) {
      const abandoned = new Date(now.getTime() - ABANDONED_EXPORT_MS);
      let total = 0;
      for (const table of [exportFile, accountExport]) {
        // Deux requêtes indexées plutôt qu'un OR (index (status, expires_at) et (created_at)).
        total += await purge(db, files, batchSize, table, () =>
          and(eq(table.status, 'ready'), lt(table.expiresAt, now)),
        );
        total += await purge(db, files, batchSize, table, () => lt(table.createdAt, abandoned));
      }
      return total;
    },
  };
}

async function purge(
  db: Database,
  files: EncryptedFileStore,
  batchSize: number,
  table: typeof exportFile | typeof accountExport,
  condition: () => ReturnType<typeof and>,
): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db.select({ id: table.id }).from(table).where(condition()).limit(batchSize);
    if (rows.length === 0) return total;
    const ids = rows.map((r) => r.id);
    for (const id of ids) await files.remove(id);
    await db.delete(table).where(inArray(table.id, ids));
    total += ids.length;
    if (rows.length < batchSize) return total;
  }
}
