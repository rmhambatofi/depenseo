// Export horaire → restauration dans une base vide → données identiques (P4-08, NF-DISP-01, §8.2).
// L'état attendu est relu dans l'instantané même de l'export : les autres suites écrivent en parallèle.
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import mysql, { type Connection, type RowDataPacket } from 'mysql2';
import type { Connection as PromiseConnection } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportDatabase, restoreBackup } from '../../src/backup/backup-files.js';
import { baseTables, createTableSql, openDumpConnection } from '../../src/backup/db-dump.js';
import { TargetNotEmptyError } from '../../src/backup/db-restore.js';
import { FileDecryptionError } from '../../src/exports/file-crypto.js';
import type { EncryptedFileStore } from '../../src/exports/file-store.js';
import { FILE_STORE } from '../../src/exports/file-store.token.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { TEST_DATABASE_URL, TEST_RESTORE_URL, migratorConnection } from '../support/db.js';
import { testDb } from '../support/jobs.js';
import { populatedAccount } from '../support/populated-account.js';

const VALUES_TABLE = 'zz_test_backup_values';
/** Tables jetables des autres suites exclues (créées/supprimées pendant l'export). */
const include = (table: string) => !table.startsWith('zz_test_') || table === VALUES_TABLE;

interface Snapshot {
  collation: unknown;
  tables: Record<string, { ddl: string; rows: string[] }>;
}

/** Schéma et contenu complets (valeurs en chaînes, binaires en octets), lignes triées. */
async function snapshot(connection: Connection): Promise<Snapshot> {
  const c = connection.promise();
  const [[collation]] = await c.query<RowDataPacket[]>(
    'SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS co FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()',
  );
  const tables: Snapshot['tables'] = {};
  for (const table of await baseTables(connection, include)) {
    const [rows] = await c.query<RowDataPacket[]>(`SELECT * FROM ${mysql.escapeId(table)}`);
    tables[table] = {
      ddl: await createTableSql(connection, table),
      rows: rows.map((row) => JSON.stringify(row)).sort(),
    };
  }
  return { collation: { ...collation }, tables };
}

async function emptyRestoreTarget(): Promise<void> {
  const connection = await openDumpConnection(TEST_RESTORE_URL);
  const c = connection.promise();
  try {
    const [[row]] = await c.query<({ db: string } & RowDataPacket)[]>('SELECT DATABASE() AS db');
    if (!row?.db.endsWith('_test')) throw new Error(`Base de test attendue, reçu ${row?.db}`);
    await c.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of await baseTables(connection, () => true)) {
      await c.query(`DROP TABLE ${mysql.escapeId(table)}`);
    }
    // Base « cPanel » par défaut : l'export doit rétablir la collation de la base d'origine.
    await c.query('ALTER DATABASE CHARACTER SET latin1 COLLATE latin1_swedish_ci');
  } finally {
    await c.end();
  }
}

// Délai relevé : sous couverture v8 (`pnpm test`), la restauration passe de 0,7 s à plus de 5 s.
describe('export horaire chiffré et restauration (P4-08, NF-DISP-01)', { timeout: 30_000 }, () => {
  const now = new Date(Date.UTC(2028, 0, 14, 10, 0, 0));
  const clock = new FakeClock(now.getTime());
  const { pool, db } = testDb(2);
  const key = randomBytes(32);
  let app: INestApplication;
  let migrator: PromiseConnection;
  let dir: string;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
    await populatedAccount(app, db, app.get<EncryptedFileStore>(FILE_STORE), now);
    migrator = await migratorConnection();
    await migrator.query(`DROP TABLE IF EXISTS ${VALUES_TABLE}`);
    await migrator.query(
      `CREATE TABLE ${VALUES_TABLE} (
        id BIGINT NOT NULL PRIMARY KEY,
        amount BIGINT NULL,
        label VARCHAR(200) NULL,
        raw VARBINARY(32) NULL,
        spent_on DATE NULL,
        at DATETIME(3) NULL,
        rate DECIMAL(18,8) NULL,
        label_upper VARCHAR(200) AS (UPPER(label)) STORED
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`,
    );
    await migrator.query(
      `INSERT INTO ${VALUES_TABLE} (id, amount, label, raw, spent_on, at, rate) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (3, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [
        1,
        '9223372036854775807',
        'L\'été 🍕\n\\ "q" \t; -- NULL\r\u0000',
        Buffer.from([0x00, 0x27, 0x5c, 0x0a, 0x1a, 0xff]),
        '2026-03-29',
        '2026-03-29 01:59:59.999',
        '1234567890.12345678',
        2,
        '-9223372036854775808',
        'NULL',
        Buffer.alloc(0),
        '1000-01-01',
        '2026-10-25 00:59:59.001',
        '-0.00000001',
      ],
    );
    dir = await mkdtemp(join(tmpdir(), 'depenseo-backup-'));
    await emptyRestoreTarget();
  });

  afterAll(async () => {
    await migrator.query(`DROP TABLE IF EXISTS ${VALUES_TABLE}`);
    await emptyRestoreTarget();
    await rm(dir, { recursive: true, force: true });
    await migrator.end();
    await app.close();
    await pool.promise().end();
  });

  it('restaure dans une base vide des données identiques à l’instantané exporté', async () => {
    let expected: Snapshot | undefined;
    const result = await exportDatabase({
      databaseUrl: TEST_DATABASE_URL,
      dir,
      key,
      retentionHours: 48,
      now: now.getTime(),
      include,
      afterDump: async (c) => {
        expected = await snapshot(c);
      },
    });
    expect(expected).toBeDefined();
    const tables = expected!.tables;
    expect(result.file).toBe(join(dir, 'depenseo-20280114T100000Z.sql.gz.enc'));
    expect(result.tables).toBe(Object.keys(tables).length);
    expect(result.rows).toBe(Object.values(tables).reduce((n, t) => n + t.rows.length, 0));
    for (const table of ['user', 'notebook', 'expense', 'spending_limit', '__drizzle_migrations']) {
      expect(tables[table]?.rows.length, table).toBeGreaterThan(0);
    }
    expect(tables[VALUES_TABLE]?.rows).toHaveLength(3);

    // Chiffré au repos, lisible du seul propriétaire du processus.
    const sealed = await readFile(result.file);
    expect(sealed.subarray(0, 4).toString('ascii')).toBe('DPF1');
    expect(sealed.includes('CREATE TABLE')).toBe(false);
    expect((await stat(result.file)).mode & 0o777).toBe(0o600);

    await restoreBackup({ file: result.file, key, databaseUrl: TEST_RESTORE_URL });
    const restoredConnection = await openDumpConnection(TEST_RESTORE_URL);
    try {
      const restored = await snapshot(restoredConnection);
      expect(restored.collation).toEqual(expected!.collation);
      expect(Object.keys(restored.tables)).toEqual(Object.keys(tables));
      for (const table of Object.keys(tables)) {
        expect(restored.tables[table], table).toEqual(tables[table]);
      }
    } finally {
      await restoredConnection.promise().end();
    }

    // Une seconde restauration sur la base désormais remplie est refusée.
    await expect(
      restoreBackup({ file: result.file, key, databaseUrl: TEST_RESTORE_URL }),
    ).rejects.toBeInstanceOf(TargetNotEmptyError);

    // Mauvaise clé ou fichier altéré : illisible, sans plus de détail.
    await expect(
      restoreBackup({ file: result.file, key: randomBytes(32), databaseUrl: TEST_RESTORE_URL }),
    ).rejects.toBeInstanceOf(FileDecryptionError);
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1]! ^= 0x01;
    const tamperedFile = join(dir, 'tampered.enc');
    await writeFile(tamperedFile, tampered);
    await expect(
      restoreBackup({ file: tamperedFile, key, databaseUrl: TEST_RESTORE_URL }),
    ).rejects.toBeInstanceOf(FileDecryptionError);
  });

  it('le schéma ne contient ni vue, ni déclencheur, ni routine, ni événement (non exportés)', async () => {
    const [[row]] = await migrator.query<RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()) AS views,
        (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()) AS triggers,
        (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()) AS routines,
        (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE()) AS events`,
    );
    expect({ ...row }).toEqual({ views: 0, triggers: 0, routines: 0, events: 0 });
  });
});
