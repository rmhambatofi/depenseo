// P1-03 : migrations rejouables et invariants de schéma (§8.2, §8.3, NF-FMT-01/03).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2';
import type mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_TABLE, migrationsFolder, runMigrations } from '../../src/db/migrate.js';
import { TEST_MIGRATOR_URL, migratorConnection } from '../support/db.js';
import { schemaViolations } from '../support/schema-invariants.js';

const MVP_TABLES = [
  'audit_log',
  'email_token',
  'job',
  'notebook',
  'notebook_member',
  'refresh_token',
  'user',
];

let connection: mysql.Connection;

beforeAll(async () => {
  connection = await migratorConnection();
});
afterAll(async () => {
  await connection.end();
});

async function tableNames(): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
  );
  return rows.map((r) => String(r.name));
}

describe('migrations', () => {
  it('créent les tables du socle comptes, audit et tâches', async () => {
    expect(await tableNames()).toEqual(expect.arrayContaining(MVP_TABLES));
  });

  it("sont rejouables : un second passage ne fait rien et n'échoue pas", async () => {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder(), 'meta', '_journal.json'), 'utf8'),
    ) as { entries: unknown[] };
    await runMigrations(TEST_MIGRATOR_URL);
    await runMigrations(TEST_MIGRATOR_URL);
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM \`${MIGRATIONS_TABLE}\``,
    );
    expect(Number(rows[0]?.n)).toBe(journal.entries.length);
  });

  it('fixent la collation par défaut de la base', async () => {
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT @@collation_database AS c, @@character_set_database AS cs',
    );
    expect(rows[0]).toMatchObject({ c: 'utf8mb4_unicode_520_ci', cs: 'utf8mb4' });
  });
});

describe('invariants de schéma', () => {
  it('sont respectés par toutes les tables présentes', async () => {
    expect(await schemaViolations(connection)).toEqual([]);
  });

  describe('contre-épreuve sur une table fautive', () => {
    const bad = `zz_test_bad_${process.pid}`;
    const good = `zz_test_good_${process.pid}`;

    beforeAll(async () => {
      await connection.query(`DROP TABLE IF EXISTS \`${bad}\`, \`${good}\``);
      await connection.query(
        `CREATE TABLE \`${bad}\` (
           id BIGINT NOT NULL PRIMARY KEY,
           notebook_id CHAR(36) NOT NULL,
           amount DOUBLE NOT NULL,
           fee_amount DECIMAL(10,2),
           currency VARCHAR(3),
           fx_rate DECIMAL(10,4),
           ratio FLOAT,
           label VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
           legacy VARCHAR(10) CHARACTER SET utf8mb3,
           seen_at TIMESTAMP NULL,
           happened_at DATETIME,
           deleted_at TINYINT
         ) ENGINE=InnoDB DEFAULT CHARSET=latin1`,
      );
      await connection.query(
        `CREATE TABLE \`${good}\` (
           id BINARY(16) NOT NULL PRIMARY KEY,
           notebook_id BINARY(16) NOT NULL,
           amount BIGINT NOT NULL,
           currency CHAR(3) NOT NULL,
           rate DECIMAL(18,8),
           label VARCHAR(10),
           spent_on DATE NOT NULL,
           updated_at DATETIME(3) NOT NULL,
           deleted_at DATETIME(3),
           INDEX sync_idx (notebook_id, updated_at, id)
         ) ENGINE=InnoDB`,
      );
    });
    afterAll(async () => {
      await connection.query(`DROP TABLE IF EXISTS \`${bad}\`, \`${good}\``);
    });

    it('signale chaque violation', async () => {
      const violations = await schemaViolations(connection, { include: (t) => t === bad });
      expect(violations).toEqual(
        expect.arrayContaining([
          `${bad}: collation de table latin1_swedish_ci`,
          // COLUMN_TYPE : « bigint(20) » sous MariaDB, « bigint » sous MySQL ≥ 8.0.19.
          expect.stringMatching(new RegExp(`^${bad}\\.id: identifiant bigint(\\(20\\))? au lieu`)),
          `${bad}.notebook_id: identifiant char(36) au lieu de binary(16)`,
          `${bad}.notebook_id: collation latin1_swedish_ci`,
          `${bad}.amount: type interdit double`,
          `${bad}.amount: montant double au lieu de bigint`,
          `${bad}.fee_amount: montant decimal au lieu de bigint`,
          `${bad}.currency: devise varchar(3) au lieu de char(3)`,
          `${bad}.fx_rate: taux decimal(10,4) au lieu de decimal(18,8)`,
          `${bad}.ratio: type interdit float`,
          `${bad}.label: collation utf8mb4_general_ci`,
          // utf8mb3 s'appelle encore « utf8 » avant MySQL 8.0.30.
          expect.stringMatching(new RegExp(`^${bad}\\.legacy: collation utf8(mb3)?_general_ci$`)),
          `${bad}.seen_at: type interdit timestamp`,
          `${bad}.happened_at: DATETIME(0) au lieu de DATETIME(3)`,
          `${bad}: colonne updated_at absente`,
          `${bad}.deleted_at: tinyint au lieu de datetime`,
          `${bad}: index (notebook_id, updated_at, id) absent`,
        ]),
      );
    });

    it('accepte une table synchronisée conforme (BIGINT, DECIMAL, DATE)', async () => {
      expect(await schemaViolations(connection, { include: (t) => t === good })).toEqual([]);
    });
  });
});
