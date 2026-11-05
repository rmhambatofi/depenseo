// `pnpm --filter api db:export` : export horaire chiffré de la base (NF-DISP-01, §8.2, ADR-039),
// lancé par la crontab o2switch à chaque heure (`node dist/scripts/db-export.js`).
// Variables : DATABASE_URL (compte API, lecture seule suffit), BACKUP_DIR (absolu, hors dossier
// public), BACKUP_ENCRYPTION_KEY (base64, 32 octets), BACKUP_RETENTION_HOURS (48 par défaut).
// Procédure de restauration : docs/dev/BACKUP.md. Sortie : une ligne JSON, sans aucune donnée.
import {
  backupKey,
  describeBackupError,
  exportDatabase,
  loadBackupExportConfig,
} from '../src/backup/backup-files.js';

try {
  const config = loadBackupExportConfig(process.env);
  const result = await exportDatabase({
    databaseUrl: config.DATABASE_URL,
    dir: config.BACKUP_DIR,
    key: backupKey(config.BACKUP_ENCRYPTION_KEY),
    retentionHours: config.BACKUP_RETENTION_HOURS,
    now: Date.now(),
  });
  process.stdout.write(
    `${JSON.stringify({
      event: 'db-export',
      file: result.file,
      bytes: result.bytes,
      tables: result.tables,
      rows: result.rows,
      pruned: result.pruned.length,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ event: 'db-export failed', error: describeBackupError(error) })}\n`,
  );
  process.exit(1);
}
