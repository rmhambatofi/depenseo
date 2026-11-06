// Migration 0020 (P8-02, ADR-069) : les emojis du plan par défaut deviennent des clés d'icône dans
// les catégories existantes, avec `updated_at` avancé pour que la synchro les renvoie. Exécutée sur
// une copie jetable de `category` (`zz_test_*`) : jamais sur les lignes des suites parallèles.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_PLAN } from '../../src/categories/default-plan.js';
import { newId, uuidToBinary } from '../../src/db/uuid.js';
import { TEST_MIGRATOR_URL } from '../support/db.js';

/** Emojis du plan avant ADR-069 (MVP), par clé de racine. */
const LEGACY_ICONS: Record<string, string> = {
  housing: '🏠',
  energy: '⚡',
  groceries: '🛒',
  restaurants: '🍽️',
  transport: '🚗',
  health: '🩺',
  insurance: '🛡️',
  taxes: '🏛️',
  children: '🧸',
  leisure: '🎭',
  shopping: '🛍️',
  subscriptions: '🔁',
  gifts: '🎁',
  misc: '📦',
};

const drizzleDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));
const migrationFile = readdirSync(drizzleDir).find((f) => /^0020_.*\.sql$/.test(f));
const table = `zz_test_category_icons_${process.pid}`;
const OLD = '2025-01-01 00:00:00.000';

describe('migration 0020 : clés d’icône du plan par défaut (F-CAT-01, ADR-069)', () => {
  let conn: mysql.Connection;

  beforeAll(async () => {
    conn = await mysql.createConnection({
      uri: TEST_MIGRATOR_URL,
      charset: 'UTF8MB4_UNICODE_520_CI',
      timezone: 'Z',
    });
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
    await conn.query(`CREATE TABLE \`${table}\` LIKE \`category\``);
  });
  afterAll(async () => {
    await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
    await conn.end();
  });

  const insert = async (icon: string, deleted = false) => {
    const id = newId();
    await conn.query(
      `INSERT INTO \`${table}\` (id, notebook_id, name, icon, color, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'x', ?, '#000000', ?, ?, ?)`,
      [uuidToBinary(id), uuidToBinary(newId()), icon, OLD, OLD, deleted ? new Date() : null],
    );
    return id;
  };
  const read = async (id: string) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT icon, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s.%f') AS updatedAt
       FROM \`${table}\` WHERE id = ?`,
      [uuidToBinary(id)],
    );
    return row as { icon: string; updatedAt: string };
  };

  it('le tableau des anciens emojis couvre toutes les racines du plan', () => {
    expect(Object.keys(LEGACY_ICONS).sort()).toEqual(
      DEFAULT_CATEGORY_PLAN.map((r) => r.key).sort(),
    );
  });

  it('remplace chaque emoji du plan par sa clé, avance updated_at, laisse le reste intact', async () => {
    expect(migrationFile, 'drizzle/0020_*.sql').toBeDefined();
    const ids = new Map<string, string>();
    for (const root of DEFAULT_CATEGORY_PLAN)
      ids.set(root.key, await insert(LEGACY_ICONS[root.key]!));
    const userEmoji = await insert('🐶');
    const nearMiss = await insert('🍽'); // sans sélecteur de variante : pas un emoji du plan
    const alreadyKey = await insert('cart');
    const deleted = await insert('🛒', true);

    const sql = readFileSync(`${drizzleDir}${migrationFile}`, 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    // Horloge de la base (celle de UTC_TIMESTAMP), pas celle de la machine de test.
    const [[clock]] = await conn.query<RowDataPacket[]>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%d %H:%i:%s.%f') AS now",
    );
    const before = Date.parse(`${(clock as { now: string }).now.slice(0, 23).replace(' ', 'T')}Z`);
    for (const statement of statements)
      await conn.query(statement.replaceAll('`category`', `\`${table}\``));

    for (const root of DEFAULT_CATEGORY_PLAN) {
      const row = await read(ids.get(root.key)!);
      expect(row.icon, root.key).toBe(root.icon);
      expect(Date.parse(`${row.updatedAt.slice(0, 23).replace(' ', 'T')}Z`)).toBeGreaterThanOrEqual(
        before,
      );
    }
    for (const [id, icon] of [
      [userEmoji, '🐶'],
      [nearMiss, '🍽'],
      [alreadyKey, 'cart'],
      [deleted, '🛒'],
    ] as const) {
      const row = await read(id);
      expect(row.icon).toBe(icon);
      expect(row.updatedAt.slice(0, 23)).toBe(OLD);
    }
  });
});
