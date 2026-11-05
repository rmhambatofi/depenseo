// Purge des exports (ADR-036) : fichier puis ligne, dès l'expiration du lien ; demandes restées en
// attente ou en échec depuis plus d'un jour (tâche abandonnée). Le fichier est effacé avant la
// ligne : une ligne sans fichier se repurge, un fichier sans ligne ne serait plus jamais retrouvé.
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { exportFile } from '../db/schema/index.js';
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
      // Deux requêtes indexées plutôt qu'un OR (index (status, expires_at) et (created_at)).
      const expired = await purge(db, files, batchSize, () =>
        and(eq(exportFile.status, 'ready'), lt(exportFile.expiresAt, now)),
      );
      const stale = await purge(db, files, batchSize, () => lt(exportFile.createdAt, abandoned));
      return expired + stale;
    },
  };
}

async function purge(
  db: Database,
  files: EncryptedFileStore,
  batchSize: number,
  condition: () => ReturnType<typeof and>,
): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db
      .select({ id: exportFile.id })
      .from(exportFile)
      .where(condition())
      .limit(batchSize);
    if (rows.length === 0) return total;
    const ids = rows.map((r) => r.id);
    for (const id of ids) await files.remove(id);
    await db.delete(exportFile).where(inArray(exportFile.id, ids));
    total += ids.length;
    if (rows.length < batchSize) return total;
  }
}
