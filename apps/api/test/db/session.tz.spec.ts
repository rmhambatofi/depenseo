// NF-FMT-02, 03, 07 et §8.2 : chaque connexion du pool est réglée par l'API, quel que soit
// le fuseau du processus (suite lancée sous les 4 TZ par `test:tz`) et celui du serveur (Europe/Paris).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, createDbPool } from '../../src/db/connection.js';
import { TEST_DATABASE_URL } from '../support/db.js';

const pool = createDbPool({ DATABASE_URL: TEST_DATABASE_URL, DB_POOL_SIZE: 4 });
const db = createDatabase(pool);
const promisePool = pool.promise();

afterAll(async () => {
  await promisePool.end();
});

// Bascules d'heure des 4 fuseaux cibles, bornes d'année et époque Unix.
const DATES = [
  '1970-01-01',
  '2026-01-01',
  '2026-03-08', // America/Montreal passe à l'heure d'été
  '2026-03-29', // Europe/Paris et Europe/Lisbon passent à l'heure d'été
  '2026-10-25', // retour à l'heure d'hiver en Europe
  '2026-11-01', // retour à l'heure d'hiver à Montréal
  '2026-12-31',
  '2028-02-29',
] as const;

describe(`session de base de données (TZ=${process.env.TZ ?? 'non défini'})`, () => {
  it.each(DATES)('relit le DATE %s comme la même chaîne', async (date) => {
    const [rows] = await promisePool.query('SELECT CAST(? AS DATE) AS d, DATE(?) AS d2', [
      date,
      date,
    ]);
    expect(rows).toEqual([{ d: date, d2: date }]);
  });

  it('relit un DATE en chaîne via Drizzle aussi', async () => {
    const [rows] = await db.execute(sql`SELECT CAST(${'2026-03-29'} AS DATE) AS d`);
    expect(rows).toEqual([{ d: '2026-03-29' }]);
  });

  it('interprète un DATETIME(3) comme de l’UTC', async () => {
    const [rows] = await promisePool.query(
      "SELECT CAST('2026-03-29 01:30:00.123' AS DATETIME(3)) AS t",
    );
    const [row] = rows as { t: Date }[];
    expect(row?.t).toBeInstanceOf(Date);
    expect(row?.t.toISOString()).toBe('2026-03-29T01:30:00.123Z');
  });

  it('écrit un Date JS en UTC et le relit identique', async () => {
    const instant = new Date(Date.UTC(2026, 2, 29, 1, 30, 0, 123));
    const [rows] = await promisePool.query(
      'SELECT CAST(? AS DATETIME(3)) AS t, DATE_FORMAT(?, "%H:%i") AS hm',
      [instant, instant],
    );
    const [row] = rows as { t: Date; hm: string }[];
    expect(row?.t.toISOString()).toBe('2026-03-29T01:30:00.123Z');
    expect(row?.hm).toBe('01:30');
  });

  it('refuse les requêtes d’une connexion dont le réglage a échoué', async () => {
    const errors: { code?: string; errno?: number }[] = [];
    const broken = createDbPool(
      { DATABASE_URL: TEST_DATABASE_URL, DB_POOL_SIZE: 1 },
      {
        sessionInit: ["SET time_zone = 'Nope/Zone'"],
        onSessionError: (error) => errors.push(error),
      },
    ).promise();
    try {
      await expect(broken.query('SELECT 1 AS one')).rejects.toBeDefined();
      expect(errors).toEqual([{ code: 'ER_UNKNOWN_TIME_ZONE', errno: 1298 }]);
    } finally {
      await broken.end();
    }
  });

  it('règle fuseau, isolation et collation sur chaque connexion du pool', async () => {
    // Quatre connexions ouvertes simultanément : toutes neuves, toutes réglées.
    const connections = await Promise.all(
      Array.from({ length: 4 }, () => promisePool.getConnection()),
    );
    try {
      const ids = new Set<number>();
      for (const connection of connections) {
        // @@tx_isolation : nom MariaDB 10.6 (MySQL 8 : @@transaction_isolation) ; lecture de test seulement.
        const [rows] = await connection.query(
          'SELECT CONNECTION_ID() AS id, @@session.time_zone AS tz, @@session.tx_isolation AS iso, ' +
            '@@session.collation_connection AS coll, @@session.character_set_client AS cs, ' +
            'TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS drift',
        );
        const [row] = rows as {
          id: number;
          tz: string;
          iso: string;
          coll: string;
          cs: string;
          drift: number;
        }[];
        expect(row).toMatchObject({
          tz: '+00:00',
          iso: 'READ-COMMITTED',
          coll: 'utf8mb4_unicode_520_ci',
          cs: 'utf8mb4',
          drift: 0,
        });
        ids.add(row!.id);
      }
      expect(ids.size).toBe(4);
    } finally {
      for (const connection of connections) connection.release();
    }
  });

  it('écrit en utf8mb4 sans perte (emoji, accents)', async () => {
    const text = 'Café 🍕 Réunion';
    const [rows] = await promisePool.query('SELECT ? AS t, CHAR_LENGTH(?) AS n', [text, text]);
    expect(rows).toEqual([{ t: text, n: 14 }]);
  });
});
