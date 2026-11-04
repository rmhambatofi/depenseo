// §8.2 : nouvelle tentative automatique sur interblocage (1213) et attente de verrou dépassée (1205).
import { DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { int, mysqlTable } from 'drizzle-orm/mysql-core';
import type mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, createDbPool } from '../../src/db/connection.js';
import { isRetryableLockError, withTransaction } from '../../src/db/transaction.js';
import { newId, uuidBinary } from '../../src/db/uuid.js';
import { TEST_DATABASE_URL, migratorConnection } from '../support/db.js';

function mysqlError(errno: number): Error {
  return Object.assign(new Error(`erreur ${errno}`), { errno, code: `ER_${errno}` });
}

/** Faux client : rejoue la suite d'issues donnée, une par tentative. */
function fakeDb(outcomes: (Error | string)[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    transaction<T>(fn: (tx: string) => Promise<T>): Promise<T> {
      const outcome = outcomes[calls++];
      if (outcome instanceof Error) return Promise.reject(outcome);
      return fn(outcome ?? 'tx');
    },
  };
}

const noSleep = (): Promise<void> => Promise.resolve();

describe('isRetryableLockError', () => {
  it('reconnaît 1213 et 1205, y compris enveloppés par Drizzle', () => {
    expect(isRetryableLockError(mysqlError(1213))).toBe(true);
    expect(isRetryableLockError(mysqlError(1205))).toBe(true);
    expect(isRetryableLockError(new DrizzleQueryError('UPDATE x', [], mysqlError(1213)))).toBe(
      true,
    );
  });

  it('ignore les autres erreurs', () => {
    expect(isRetryableLockError(mysqlError(1062))).toBe(false);
    expect(isRetryableLockError(new Error('autre'))).toBe(false);
    expect(isRetryableLockError('1213')).toBe(false);
    expect(isRetryableLockError(undefined)).toBe(false);
  });
});

describe('withTransaction (unitaire)', () => {
  it('rejoue après un interblocage puis renvoie le résultat', async () => {
    const db = fakeDb([mysqlError(1213), mysqlError(1205), 'tx']);
    const retries: number[] = [];
    const result = await withTransaction(db, (tx) => Promise.resolve(`ok:${tx}`), {
      sleep: noSleep,
      onRetry: (attempt, errno) => {
        retries.push(attempt * 10000 + errno);
      },
    });
    expect(result).toBe('ok:tx');
    expect(db.calls).toBe(3);
    expect(retries).toEqual([11213, 21205]);
  });

  it('ne rejoue pas une erreur non liée aux verrous', async () => {
    const db = fakeDb([mysqlError(1062), 'tx']);
    await expect(withTransaction(db, () => Promise.resolve(1), { sleep: noSleep })).rejects.toThrow(
      'erreur 1062',
    );
    expect(db.calls).toBe(1);
  });

  it('abandonne après le nombre maximal de tentatives avec la dernière erreur', async () => {
    const db = fakeDb(Array.from({ length: 10 }, () => mysqlError(1213)));
    await expect(
      withTransaction(db, () => Promise.resolve(1), { sleep: noSleep, maxAttempts: 4 }),
    ).rejects.toMatchObject({ errno: 1213 });
    expect(db.calls).toBe(4);
  });

  it('attend de plus en plus longtemps entre deux tentatives', async () => {
    const db = fakeDb([mysqlError(1213), mysqlError(1213), mysqlError(1213), 'tx']);
    const delays: number[] = [];
    await withTransaction(db, () => Promise.resolve(1), {
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      random: () => 0,
    });
    expect(delays).toHaveLength(3);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(delays[0]!);
    expect(delays[2]).toBeGreaterThan(delays[1]!);
  });
});

// Table jetable créée par le compte migrator : l'API n'a pas de droit DDL (ADR-010).
const probe = mysqlTable('zz_test_lock_probe', {
  id: uuidBinary('id').primaryKey(),
  n: int('n').notNull(),
});

describe('withTransaction (intégration MariaDB)', () => {
  const pool = createDbPool({ DATABASE_URL: TEST_DATABASE_URL, DB_POOL_SIZE: 4 });
  const db = createDatabase(pool);
  let admin: mysql.Connection;

  beforeAll(async () => {
    admin = await migratorConnection();
    await admin.query('DROP TABLE IF EXISTS zz_test_lock_probe');
    await admin.query(
      'CREATE TABLE zz_test_lock_probe (id BINARY(16) NOT NULL PRIMARY KEY, n INT NOT NULL) ' +
        'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci',
    );
  });

  afterAll(async () => {
    await admin.query('DROP TABLE IF EXISTS zz_test_lock_probe');
    await admin.end();
    await pool.promise().end();
  });

  async function counters(...ids: string[]): Promise<number[]> {
    const rows = await db.select().from(probe);
    return ids.map((id) => rows.find((row) => row.id === id)?.n ?? -1);
  }

  it('stocke un UUID en BINARY(16) et l’insert est idempotent', async () => {
    const id = newId();
    await db
      .insert(probe)
      .values({ id, n: 1 })
      .onDuplicateKeyUpdate({ set: { n: 1 } });
    await db
      .insert(probe)
      .values({ id, n: 1 })
      .onDuplicateKeyUpdate({ set: { n: 1 } });
    const [rows] = await pool
      .promise()
      .query('SELECT HEX(id) AS hex, LENGTH(id) AS len FROM zz_test_lock_probe WHERE id = ?', [
        Buffer.from(id.replaceAll('-', ''), 'hex'),
      ]);
    expect(rows).toEqual([{ hex: id.replaceAll('-', '').toUpperCase(), len: 16 }]);
    expect(await counters(id)).toEqual([1]);
  });

  it('rejoue la victime d’un interblocage provoqué (1213)', async () => {
    const a = newId();
    const b = newId();
    await db.insert(probe).values([
      { id: a, n: 0 },
      { id: b, n: 0 },
    ]);

    // Chaque transaction verrouille sa première ligne puis attend l'autre avant de prendre la seconde.
    let arrived = 0;
    let release!: () => void;
    const bothHoldALock = new Promise<void>((resolve) => (release = resolve));
    let attempts = 0;
    const retried: number[] = [];

    const transfer = (first: string, second: string) =>
      withTransaction(
        db,
        async (tx) => {
          attempts += 1;
          await tx
            .update(probe)
            .set({ n: sql`${probe.n} + 1` })
            .where(eq(probe.id, first));
          if (++arrived === 2) release();
          await bothHoldALock;
          await tx
            .update(probe)
            .set({ n: sql`${probe.n} + 1` })
            .where(eq(probe.id, second));
        },
        {
          onRetry: (_attempt, errno) => {
            retried.push(errno);
          },
        },
      );

    await Promise.all([transfer(a, b), transfer(b, a)]);
    expect(retried).toEqual([1213]);
    expect(attempts).toBe(3);
    expect(await counters(a, b)).toEqual([2, 2]);
  });

  it('rejoue après une attente de verrou dépassée (1205)', async () => {
    const id = newId();
    await db.insert(probe).values({ id, n: 0 });

    // Un tiers garde la ligne verrouillée jusqu'à la première nouvelle tentative.
    const holder = await migratorConnection();
    await holder.query('START TRANSACTION');
    await holder.query('SELECT n FROM zz_test_lock_probe WHERE id = ? FOR UPDATE', [
      Buffer.from(id.replaceAll('-', ''), 'hex'),
    ]);

    const retried: number[] = [];
    const solo = createDbPool({ DATABASE_URL: TEST_DATABASE_URL, DB_POOL_SIZE: 1 });
    try {
      await withTransaction(
        createDatabase(solo),
        async (tx) => {
          await tx.execute(sql`SET SESSION innodb_lock_wait_timeout = 1`);
          await tx
            .update(probe)
            .set({ n: sql`${probe.n} + 1` })
            .where(eq(probe.id, id));
        },
        {
          onRetry: async (_attempt, errno) => {
            retried.push(errno);
            await holder.query('COMMIT');
          },
        },
      );
    } finally {
      await holder.end();
      // Pool dédié : le délai d'attente réduit ne revient jamais dans le pool partagé.
      await solo.promise().end();
    }
    expect(retried).toEqual([1205]);
    expect(await counters(id)).toEqual([1]);
  }, 15_000);
});
