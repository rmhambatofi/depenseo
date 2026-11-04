// Application des migrations SQL versionnées (drizzle/), rejouable : seules les migrations
// postérieures à la dernière appliquée s'exécutent (ADR-015). Compte migrator uniquement.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import type { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import { SESSION_INIT_SQL } from './connection.js';

export const MIGRATIONS_TABLE = '__drizzle_migrations';
const MIGRATION_LOCK = 'depenseo_migrate';
const LOCK_TIMEOUT_S = 60;

/**
 * Dossier `drizzle/` du paquet, trouvé en remontant depuis ce fichier : le même code tourne depuis
 * `src/db` (tests) et depuis `dist/src/db` (production).
 */
export function migrationsFolder(from: string = dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'drizzle');
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate;
    if (dirname(dir) === dir) throw new Error('Dossier de migrations drizzle/ introuvable');
  }
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    charset: 'UTF8MB4_UNICODE_520_CI',
    timezone: 'Z',
  });
  try {
    for (const statement of SESSION_INIT_SQL) await connection.query(statement);
    // Deux lancements simultanés (déploiement + cron) ne doivent pas s'entrelacer.
    const [[lock]] = await connection.query<({ ok: number | null } & RowDataPacket)[]>(
      'SELECT GET_LOCK(?, ?) AS ok',
      [MIGRATION_LOCK, LOCK_TIMEOUT_S],
    );
    if (lock?.ok !== 1) throw new Error('Verrou de migration non obtenu');
    try {
      await migrate(drizzle(connection), {
        migrationsFolder: migrationsFolder(),
        migrationsTable: MIGRATIONS_TABLE,
      });
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK]);
    }
  } finally {
    await connection.end();
  }
}
