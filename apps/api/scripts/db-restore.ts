// `pnpm --filter api db:restore <fichier.sql.gz.enc>` : restaure un export horaire dans une base
// **vide** (refus sinon), avec le compte migrator (DDL). Procédure complète : docs/dev/BACKUP.md.
// Variables : RESTORE_DATABASE_URL, BACKUP_ENCRYPTION_KEY (la clé en vigueur lors de l'export).
import { resolve } from 'node:path';
import {
  backupKey,
  describeBackupError,
  loadBackupRestoreConfig,
  restoreBackup,
} from '../src/backup/backup-files.js';

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage : db-restore <fichier.sql.gz.enc>\n');
  process.exit(1);
}
try {
  const config = loadBackupRestoreConfig(process.env);
  const statements = await restoreBackup({
    file: resolve(file),
    key: backupKey(config.BACKUP_ENCRYPTION_KEY),
    databaseUrl: config.RESTORE_DATABASE_URL,
  });
  process.stdout.write(`${JSON.stringify({ event: 'db-restore', statements })}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ event: 'db-restore failed', error: describeBackupError(error) })}\n`,
  );
  process.exit(1);
}
