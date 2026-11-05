// Tableau de bord (F-TB-01/02, ADR-031) : jauge ou total sans limite, dernières dépenses,
// répartition par catégorie racine, cumul comparé à la période précédente, évolution sur 12 périodes.
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryBreakdown, cumulativeByDay } from '../../src/dashboard/dashboard.js';
import type { PeriodSlice } from '../../src/limits/period-summary.js';
import { createTenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { dashboardClient } from '../support/dashboard.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';

const NOVEMBER: PeriodSlice = {
  start: '2026-11-01',
  end: '2026-11-30',
  rule: { kind: 'month', startDay: 1 },
  version: undefined,
};
const day = (spentOn: string, total: number, currency = 'EUR', source = 'manual' as const) => ({
  spentOn,
  source,
  currency,
  total: BigInt(total),
});

describe('cumulativeByDay', () => {
  it('un point par jour jusqu’au dernier jour demandé, jours vides compris', () => {
    const points = cumulativeByDay(
      NOVEMBER,
      '2026-11-04',
      [day('2026-11-02', 100), day('2026-11-04', 50), day('2026-11-04', 7, 'USD')],
      'EUR',
    );
    expect(points).toEqual([
      { day: 1, date: '2026-11-01', cumulative: 0 },
      { day: 2, date: '2026-11-02', cumulative: 100 },
      { day: 3, date: '2026-11-03', cumulative: 100 },
      { day: 4, date: '2026-11-04', cumulative: 150 },
    ]);
  });

  it('période close : bornée à sa fin ; période future : vide', () => {
    expect(cumulativeByDay(NOVEMBER, '2027-01-01', [], 'EUR')).toHaveLength(30);
    expect(cumulativeByDay(NOVEMBER, '2026-10-31', [], 'EUR')).toEqual([]);
  });
});

describe('categoryBreakdown', () => {
  const total = (categoryId: string, value: number, currency = 'EUR') => ({
    categoryId,
    source: 'manual' as const,
    currency,
    total: BigInt(value),
  });

  it('cumule par racine, ignore les autres devises, trie par total puis identifiant', () => {
    expect(
      categoryBreakdown(
        NOVEMBER,
        [total('b', 100), total('a', 100), total('c', 50), total('c', 50), total('d', 999, 'USD')],
        'EUR',
      ),
    ).toEqual([
      { categoryId: 'a', total: 100, percent: 33 },
      { categoryId: 'b', total: 100, percent: 33 },
      { categoryId: 'c', total: 100, percent: 33 },
    ]);
  });

  it('aucune dépense → liste vide', () => {
    expect(categoryBreakdown(NOVEMBER, [], 'EUR')).toEqual([]);
  });
});

describe('GET /notebooks/{id}/dashboard (F-TB-01/02)', () => {
  // Mercredi 18 novembre 2026 dans les quatre fuseaux.
  const clock = new FakeClock(Date.UTC(2026, 10, 18, 10, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const board = dashboardClient(() => app, db);
  const summary = summaryClient(() => app, db);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const tenant = () => createTenant(app, db, clock.now());

  it('carnet vide : total sans limite à 0, 12 mois civils, cumuls à zéro', async () => {
    const t = await tenant();
    const d = await board.dashboard(t);
    expect(d.today).toBe('2026-11-18');
    expect(d.gauge).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-30',
      limit: null,
      spent: 0,
    });
    expect(d.recent).toEqual([]);
    expect(d.categories).toEqual([]);
    expect(d.evolution).toHaveLength(12);
    expect(d.evolution[0]).toEqual(d.gauge);
    expect(d.evolution.map((p) => p.start).at(-1)).toBe('2025-12-01');
    expect(d.cumulative.current).toHaveLength(18);
    expect(d.cumulative.previous).toHaveLength(31);
    expect(d.cumulative.previous.at(-1)).toEqual({ day: 31, date: '2026-10-31', cumulative: 0 });
  });

  it('jauge, répartition et cumuls cohérents ; supprimées, autre devise et hors période exclues', async () => {
    const t = await tenant();
    const [r1, r2] = (await board.plan(t)).roots;
    await summary.limit(t, '2026-01-01', 100_000);
    await board.spend(t, r1!.subs[0]!, '2026-11-02', 3_000);
    await board.spend(t, r1!.subs[1]!, '2026-11-10', 1_000);
    await board.spend(t, r1!.id, '2026-11-18', 500);
    await board.spend(t, r2!.subs[0]!, '2026-11-10', 2_000);
    await board.spend(t, r2!.subs[0]!, '2026-11-25', 1_000); // à venir dans la période
    await board.spend(t, r2!.subs[0]!, '2026-11-11', 9_999, { deleted: true });
    await board.spend(t, r2!.subs[0]!, '2026-11-11', 8_888, { currency: 'USD' });
    await board.spend(t, r2!.subs[0]!, '2026-10-05', 700);
    await board.spend(t, r2!.subs[0]!, '2026-02-03', 40);
    const d = await board.dashboard(t);

    expect(d.gauge).toMatchObject({ limit: 100_000, spent: 7_500, consumedPercent: 7 });
    expect(d.gauge.otherCurrencies).toEqual(['USD']);
    expect(d.categories).toEqual([
      { categoryId: r1!.id, total: 4_500, percent: 60 },
      { categoryId: r2!.id, total: 3_000, percent: 40 },
    ]);
    expect(d.categories.reduce((s, c) => s + c.total, 0)).toBe(d.gauge.spent);

    expect(d.cumulative.current.map((p) => p.cumulative)).toEqual([
      0,
      3_000,
      ...Array<number>(7).fill(3_000),
      6_000,
      ...Array<number>(7).fill(6_000),
      6_500,
    ]);
    expect(d.cumulative.previous[3]!.cumulative).toBe(0);
    expect(d.cumulative.previous[4]).toEqual({ day: 5, date: '2026-10-05', cumulative: 700 });
    expect(d.cumulative.previous.at(-1)!.cumulative).toBe(700);

    expect(d.evolution.map((p) => p.spent)).toEqual([7_500, 700, 0, 0, 0, 0, 0, 0, 0, 40, 0, 0]);
  });

  it('sans limite : devise du compte pour la jauge, la répartition et le cumul', async () => {
    const t = await tenant();
    const [root] = (await board.plan(t)).roots;
    await board.spend(t, root!.subs[0]!, '2026-11-03', 1_200);
    await board.spend(t, root!.subs[0]!, '2026-11-04', 9_000, { currency: 'USD' });
    const d = await board.dashboard(t);
    expect(d.gauge).toMatchObject({ limit: null, currency: 'EUR', spent: 1_200 });
    expect(d.categories).toEqual([{ categoryId: root!.id, total: 1_200, percent: 100 }]);
    expect(d.cumulative.current.at(-1)!.cumulative).toBe(1_200);
  });

  it('dernières dépenses : 5 au plus, par date décroissante, supprimées exclues', async () => {
    const t = await tenant();
    const [root] = (await board.plan(t)).roots;
    const ids: string[] = [];
    for (const date of ['2026-11-01', '2026-11-03', '2026-09-01', '2026-11-05', '2026-11-07']) {
      ids.push(await board.spend(t, root!.subs[0]!, date, 100));
    }
    await board.spend(t, root!.subs[0]!, '2026-11-17', 100, { deleted: true });
    ids.push(await board.spend(t, root!.subs[0]!, '2026-11-02', 100));
    const d = await board.dashboard(t);
    expect(d.recent.map((e) => e.date)).toEqual([
      '2026-11-07',
      '2026-11-05',
      '2026-11-03',
      '2026-11-02',
      '2026-11-01',
    ]);
    expect(d.recent[0]).toMatchObject({ id: ids[4], amount: 100, currency: 'EUR', tags: [] });
  });

  it('limite hors récurrences : jauge, répartition et cumul les excluent', async () => {
    const t = await tenant();
    const [root] = (await board.plan(t)).roots;
    await summary.limit(t, '2026-01-01', 10_000, { includeRecurring: false });
    await board.spend(t, root!.subs[0]!, '2026-11-02', 1_000);
    await board.spend(t, root!.subs[0]!, '2026-11-03', 5_000, { source: 'recurrence' });
    const d = await board.dashboard(t);
    expect(d.gauge.spent).toBe(1_000);
    expect(d.categories).toEqual([{ categoryId: root!.id, total: 1_000, percent: 100 }]);
    expect(d.cumulative.current.at(-1)!.cumulative).toBe(1_000);
  });

  it('limite hebdomadaire : périodes lundi → dimanche', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000, { periodKind: 'week' });
    const d = await board.dashboard(t);
    expect(d.gauge).toMatchObject({ start: '2026-11-16', end: '2026-11-22' });
    expect(d.cumulative.current).toHaveLength(3);
    expect(d.cumulative.previous.map((p) => p.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(d.evolution.at(-1)!.start).toBe('2026-08-31');
  });

  it('carnet d’un autre compte → 404, sans rien révéler', async () => {
    const [a, b] = [await tenant(), await tenant()];
    const res = await board.get({ ...a, notebookId: b.notebookId });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('gauge');
  });

  it('sans jeton → 401', async () => {
    const t = await tenant();
    const res = await board.get({ ...t, accessToken: 'x' });
    expect(res.status).toBe(401);
  });
});
