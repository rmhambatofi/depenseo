// Données fictives hors production (NF-QUA-03, P7-07, ADR-066) : `pnpm --filter api seed:fake`.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyPassword } from '../../src/auth/password.js';
import { category, expense, notebook, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import {
  SeedFakeError,
  assertSeedTarget,
  loadSeedFakeConfig,
  seedFake,
} from '../../src/dev/seed-fake.js';
import { testDb } from '../support/jobs.js';

const now = new Date(Date.UTC(2026, 10, 5, 9, 0, 0));
const { pool, db } = testDb();

afterAll(async () => {
  await pool.promise().end();
});

/** Générateur déterministe (LCG) : mêmes données à chaque exécution. */
const lcg = (seed = 42) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
};

describe('assertSeedTarget', () => {
  it.each([
    'mysql://u:p@127.0.0.1:3307/depenseo_dev',
    'mysql://u:p@localhost/o2user_depenseo_recette',
    'mysql://u:p@127.0.0.1:3307/depenseo_test?charset=utf8mb4',
  ])('accepte une base de développement, de recette ou de test : %s', (url) => {
    expect(() => assertSeedTarget(url)).not.toThrow();
  });

  it.each([
    'mysql://u:p@localhost/o2user_depenseo_prod',
    'mysql://u:p@localhost/depenseo',
    'mysql://u:p@localhost/depenseo_dev_prod',
    'pas une url',
  ])('refuse toute autre base (production) : %s', (url) => {
    expect(() => assertSeedTarget(url)).toThrow(SeedFakeError);
  });
});

describe('loadSeedFakeConfig', () => {
  const env = {
    DATABASE_URL: 'mysql://u:p@localhost/depenseo_dev',
    SEED_FAKE_PASSWORD: 'mot de passe de démo',
  };

  it('lit la base, le mot de passe et les volumes par défaut', () => {
    expect(loadSeedFakeConfig(env)).toEqual({
      databaseUrl: env.DATABASE_URL,
      password: env.SEED_FAKE_PASSWORD,
      accounts: 3,
      expensesPerAccount: 120,
    });
    expect(
      loadSeedFakeConfig({ ...env, SEED_FAKE_ACCOUNTS: '5', SEED_FAKE_EXPENSES: '10' }),
    ).toMatchObject({ accounts: 5, expensesPerAccount: 10 });
  });

  it('refuse une base de production, un mot de passe court ou des volumes invalides', () => {
    expect(() =>
      loadSeedFakeConfig({ ...env, DATABASE_URL: 'mysql://u:p@h/depenseo_prod' }),
    ).toThrow(SeedFakeError);
    expect(() => loadSeedFakeConfig({ ...env, SEED_FAKE_PASSWORD: 'court' })).toThrow(
      SeedFakeError,
    );
    expect(() => loadSeedFakeConfig({ DATABASE_URL: env.DATABASE_URL })).toThrow(SeedFakeError);
    for (const bad of ['0', '-1', '1.5', 'abc', '1001']) {
      expect(() => loadSeedFakeConfig({ ...env, SEED_FAKE_ACCOUNTS: bad })).toThrow(SeedFakeError);
    }
    expect(loadSeedFakeConfig({ ...env, SEED_FAKE_EXPENSES: '20000' }).expensesPerAccount).toBe(
      20_000,
    );
    expect(() => loadSeedFakeConfig({ ...env, SEED_FAKE_EXPENSES: '20001' })).toThrow(
      SeedFakeError,
    );
  });
});

describe('seedFake', () => {
  it('crée des comptes vérifiés avec carnet et dépenses en centimes sur les 90 derniers jours', async () => {
    const prefix = `demo-${newId()}`;
    const result = await seedFake(db, {
      emailPrefix: prefix,
      password: 'mot de passe de démo',
      accounts: 2,
      expensesPerAccount: 15,
      today: '2026-11-05',
      now,
      random: lcg(),
    });

    expect(result.created).toEqual([`${prefix}.1@example.test`, `${prefix}.2@example.test`]);
    expect(result.skipped).toEqual([]);

    const accounts = await db.select().from(user).where(inArray(user.email, result.created));
    expect(accounts).toHaveLength(2);
    for (const account of accounts) {
      expect(account.emailVerifiedAt).toEqual(now);
      expect(await verifyPassword(account.passwordHash, 'mot de passe de démo')).toBe(true);

      const [book] = await db.select().from(notebook).where(eq(notebook.ownerId, account.id));
      const rows = await db
        .select({
          amount: expense.amount,
          currency: expense.currency,
          spentOn: expense.spentOn,
          parentId: category.parentId,
          catNotebook: category.notebookId,
        })
        .from(expense)
        .innerJoin(category, eq(category.id, expense.categoryId))
        .where(and(eq(expense.notebookId, book!.id), isNull(expense.deletedAt)));
      expect(rows).toHaveLength(15);
      for (const row of rows) {
        expect(Number.isInteger(row.amount)).toBe(true);
        expect(row.amount).toBeGreaterThanOrEqual(100);
        expect(row.amount).toBeLessThanOrEqual(15_000);
        expect(row.currency).toBe('EUR');
        expect(row.spentOn >= '2026-08-08' && row.spentOn <= '2026-11-05').toBe(true);
        expect(row.parentId).not.toBeNull();
        expect(row.catNotebook).toEqual(book!.id);
      }
    }
  });

  it('insère par lots au-delà de 1 000 dépenses', async () => {
    const prefix = `demo-${newId()}`;
    await seedFake(db, {
      emailPrefix: prefix,
      password: 'mot de passe de démo',
      accounts: 1,
      expensesPerAccount: 1_001,
      today: '2026-11-05',
      now,
      random: lcg(3),
    });
    const [{ count }] = (await db
      .select({ count: sql<number>`count(*)` })
      .from(expense)
      .innerJoin(notebook, eq(notebook.id, expense.notebookId))
      .innerJoin(user, eq(user.id, notebook.ownerId))
      .where(eq(user.email, `${prefix}.1@example.test`))) as [{ count: number }];
    expect(Number(count)).toBe(1_001);
  });

  it('est rejouable : un compte existant est laissé tel quel', async () => {
    const prefix = `demo-${newId()}`;
    const options = {
      emailPrefix: prefix,
      password: 'mot de passe de démo',
      accounts: 1,
      expensesPerAccount: 3,
      today: '2026-11-05',
      now,
      random: lcg(7),
    };
    await seedFake(db, options);
    const again = await seedFake(db, { ...options, accounts: 2 });
    expect(again).toEqual({
      created: [`${prefix}.2@example.test`],
      skipped: [`${prefix}.1@example.test`],
    });
    const [{ count }] = (await db
      .select({ count: sql<number>`count(*)` })
      .from(expense)
      .innerJoin(notebook, eq(notebook.id, expense.notebookId))
      .innerJoin(user, eq(user.id, notebook.ownerId))
      .where(eq(user.email, `${prefix}.1@example.test`))) as [{ count: number }];
    expect(Number(count)).toBe(3);
  });
});
