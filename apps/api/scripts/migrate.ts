// `pnpm --filter api migrate` : applique les migrations avec le compte migrator (DDL), jamais
// celui de l'API. Variable obligatoire : MIGRATOR_DATABASE_URL.
import { describeError } from '../src/logging/redact.js';
import { runMigrations } from '../src/db/migrate.js';

const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) {
  process.stderr.write('MIGRATOR_DATABASE_URL manquante\n');
  process.exit(1);
}
try {
  await runMigrations(url);
  process.stdout.write('Migrations appliquées\n');
} catch (error) {
  process.stderr.write(`Échec des migrations : ${JSON.stringify(describeError(error as Error))}\n`);
  process.exit(1);
}
