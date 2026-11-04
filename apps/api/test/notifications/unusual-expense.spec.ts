// Dépense inhabituellement élevée (F-NOT-01, ADR-005, ADR-030) : à la création, une dépense
// ≥ 3 × la médiane de sa catégorie racine (90 jours, ≥ 5 dépenses d'historique, même devise) et
// ≥ 2 000 unités mineures crée une tâche `notify` sans montant, une seule fois par dépense.
import type { INestApplication } from '@nestjs/common';
import { and, eq, isNull, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { category, expense, job } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { isUnusualAmount } from '../../src/expenses/unusual-expense.js';
import { createTenant, type Tenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

describe('isUnusualAmount (ADR-005)', () => {
  it.each([
    ['historique insuffisant (4)', 9_000, [1_000, 1_000, 1_000, 1_000], false],
    ['exactement 3 × médiane', 3_000, [1_000, 1_000, 1_000, 1_000, 1_000], true],
    ['juste sous 3 × médiane', 2_999, [1_000, 1_000, 1_000, 1_000, 1_000], false],
    ['sous le plancher de 2 000', 1_999, [100, 100, 100, 100, 100], false],
    ['plancher atteint', 2_000, [100, 100, 100, 100, 100], true],
    [
      'médiane paire = moyenne des deux centrales',
      3_750,
      [100, 1_000, 1_500, 9_000, 9_000, 1],
      true,
    ],
    ['médiane paire, juste sous', 3_749, [100, 1_000, 1_500, 9_000, 9_000, 1], false],
    ['médiane insensible aux extrêmes', 3_000, [1, 1_000, 1_000, 1_000, 99_999_999_999], true],
  ])('%s', (_label, amount, history, expected) => {
    expect(isUnusualAmount(amount, history)).toBe(expected);
  });
});

describe('Alerte de dépense inhabituelle à la création (F-NOT-01)', () => {
  const NOW = Date.UTC(2026, 8, 10, 10, 0, 0); // jeudi 10 septembre 2026
  const TODAY = '2026-09-10';
  const STAMP = new Date(NOW);
  const clock = new FakeClock(NOW);
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const expenses = expenseClient(() => app, db, clock);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  beforeEach(() => clock.set(NOW));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  interface Plan {
    t: Tenant;
    /** Deux sous-catégories d'une même racine, la racine, et une sous-catégorie d'une autre racine. */
    sub: string;
    sibling: string;
    root: string;
    otherRoot: string;
  }

  async function plan(): Promise<Plan> {
    const t = await createTenant(app, db, clock.now());
    const rows = await db
      .select({ id: category.id, parentId: category.parentId })
      .from(category)
      .where(and(eq(category.notebookId, t.notebookId), isNull(category.deletedAt)));
    const children = new Map<string, string[]>();
    for (const r of rows) {
      if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id]);
    }
    const [root, subs] = [...children].find(([, ids]) => ids.length >= 2)!;
    const [, others] = [...children].find(([id]) => id !== root)!;
    return { t, sub: subs[0]!, sibling: subs[1]!, root, otherRoot: others[0]! };
  }

  /** Historique inséré directement en base (montant, date, catégorie, options). */
  async function history(
    p: Plan,
    amount: number,
    spentOn: string,
    categoryId = p.sub,
    opts: { currency?: string; deleted?: boolean; count?: number } = {},
  ) {
    for (let i = 0; i < (opts.count ?? 1); i++) {
      await db.insert(expense).values({
        id: newId(),
        notebookId: p.t.notebookId,
        amount,
        currency: opts.currency ?? 'EUR',
        categoryId,
        spentOn,
        source: 'manual',
        createdAt: STAMP,
        updatedAt: STAMP,
        deletedAt: opts.deleted ? STAMP : null,
      });
    }
  }

  async function create(p: Plan, amount: number, extra: object = {}) {
    const id = newId();
    const res = await expenses.create(p.t, {
      id,
      amount,
      categoryId: p.sub,
      date: TODAY,
      ...extra,
    });
    expect(res.status).toBe(201);
    return id;
  }

  const unusualJobs = async (p: Plan) =>
    db
      .select()
      .from(job)
      .where(and(like(job.uniqueKey, 'unusual:%'), like(job.payload, `%"${p.t.notebookId}"%`)));

  it('seuil franchi : une tâche notify sans montant, clé unique par dépense', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5 });
    const id = await create(p, 3_000);
    const rows = await unusualJobs(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('notify');
    expect(rows[0]!.uniqueKey).toBe(`unusual:${id}`);
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      kind: 'unusual_expense',
      notebookId: p.t.notebookId,
      expenseId: id,
    });
    expect(rows[0]!.payload).not.toContain('amount');
  });

  it('seuil non franchi : 2 999 pour une médiane de 1 000 → rien', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5 });
    await create(p, 2_999);
    expect(await unusualJobs(p)).toEqual([]);
  });

  it('historique insuffisant : 4 dépenses → rien, même pour un montant énorme', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 4 });
    await create(p, 1_000_000);
    expect(await unusualJobs(p)).toEqual([]);
  });

  it('montant sous 20 € → rien, même à 15 × la médiane', async () => {
    const p = await plan();
    await history(p, 100, '2026-09-01', p.sub, { count: 5 });
    await create(p, 1_500);
    expect(await unusualJobs(p)).toEqual([]);
  });

  it('historique de toute la catégorie racine (racine et sous-catégories sœurs)', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sibling, { count: 3 });
    await history(p, 1_000, '2026-09-01', p.root, { count: 2 });
    await create(p, 3_000);
    expect(await unusualJobs(p)).toHaveLength(1);
  });

  it('une dépense saisie sur la racine compare aux sous-catégories', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5 });
    await create(p, 3_000, { categoryId: p.root });
    expect(await unusualJobs(p)).toHaveLength(1);
  });

  it('exclut autre racine, autre devise, supprimées et hors fenêtre de 90 jours', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.otherRoot, { count: 5 });
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5, currency: 'USD' });
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5, deleted: true });
    await history(p, 1_000, '2026-06-11', p.sub, { count: 4 }); // J−91
    await history(p, 1_000, '2026-06-12', p.sub); // J−90 : seule dans la fenêtre
    await create(p, 3_000);
    expect(await unusualJobs(p)).toEqual([]);
  });

  it('fenêtre : J−90 et J inclus, dépenses postérieures exclues', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-06-12', p.sub, { count: 3 }); // J−90
    await history(p, 1_000, TODAY, p.sub, { count: 2 });
    await history(p, 100_000, '2026-09-11', p.sub, { count: 5 }); // après la dépense
    await create(p, 3_000);
    expect(await unusualJobs(p)).toHaveLength(1);
  });

  it('fenêtre relative à la date de la dépense, pas à aujourd’hui', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-03-01', p.sub, { count: 5 });
    await create(p, 3_000, { date: '2026-03-15' });
    expect(await unusualJobs(p)).toHaveLength(1);
  });

  it('dépense en autre devise : comparée à l’historique de sa devise', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5 }); // EUR
    await create(p, 3_000, { currency: 'USD' });
    expect(await unusualJobs(p)).toEqual([]);
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5, currency: 'USD' });
    await create(p, 3_000, { currency: 'USD' });
    expect(await unusualJobs(p)).toHaveLength(1);
  });

  it('rejeu de la création et modification ultérieure : toujours une seule alerte', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5 });
    const id = await create(p, 3_000);
    const replay = await expenses.create(p.t, {
      id,
      amount: 3_000,
      categoryId: p.sub,
      date: TODAY,
    });
    expect(replay.status).toBe(201);
    expect((await expenses.patch(p.t, id, { amount: 9_000 })).status).toBe(200);
    expect(await unusualJobs(p)).toHaveLength(1);
  });

  it('une modification ne déclenche pas d’alerte (création seulement)', async () => {
    const p = await plan();
    await history(p, 1_000, '2026-09-01', p.sub, { count: 5 });
    const id = await create(p, 1_000);
    expect((await expenses.patch(p.t, id, { amount: 9_000 })).status).toBe(200);
    expect(await unusualJobs(p)).toEqual([]);
  });
});
