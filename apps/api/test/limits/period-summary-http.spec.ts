// `GET /notebooks/{id}/limits/current` (F-LIM-03/05, ADR-028) : jauge de la période en cours et
// des périodes passées, calculée par l'API à partir des dépenses du seul carnet demandé.
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';

describe('GET …/limits/current (F-LIM-03/05)', () => {
  // 2026-05-12 10:00 UTC : mardi 12 mai à Paris.
  const clock = new FakeClock(Date.UTC(2026, 4, 12, 10, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const client = summaryClient(() => app, db);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const tenant = () => createTenant(app, db, clock.now());

  it('sans limite : mois civil, total du carnet seul, supprimées exclues', async () => {
    const t = await tenant();
    const other = await tenant();
    await client.spend(t, '2026-05-01', 1_000);
    await client.spend(t, '2026-05-12', 2_500);
    await client.spend(t, '2026-05-31', 400); // date future de la période en cours : comptée
    await client.spend(t, '2026-05-10', 9_999, { deleted: true });
    await client.spend(t, '2026-04-30', 700);
    await client.spend(other, '2026-05-02', 123_456);
    const res = await client.get(t);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      timeZone: 'Europe/Paris',
      today: '2026-05-12',
      current: {
        start: '2026-05-01',
        end: '2026-05-31',
        periodKind: 'month',
        startDay: 1,
        limitId: null,
        limit: null,
        currency: 'EUR',
        includeRecurring: true,
        spent: 3_900,
        remaining: null,
        consumedPercent: null,
        elapsedDays: 12,
        totalDays: 31,
        elapsedPercent: 38,
        otherCurrencies: [],
      },
      past: [],
    });
  });

  it('limite en vigueur, rythme, périodes passées avec leur propre limite (F-LIM-09)', async () => {
    const t = await tenant();
    await client.limit(t, '2026-03-10', 50_000);
    const id = await client.limit(t, '2026-05-02', 80_000);
    await client.spend(t, '2026-05-03', 49_600);
    await client.spend(t, '2026-04-15', 60_000);
    await client.spend(t, '2026-02-27', 1);
    const body = await client.current(t, '?past=3');
    expect(body.current).toMatchObject({
      limitId: id,
      limit: 80_000,
      spent: 49_600,
      remaining: 30_400,
      consumedPercent: 62,
      elapsedPercent: 38,
    });
    expect(body.past.map((p) => [p.start, p.limit, p.spent, p.remaining])).toEqual([
      ['2026-04-01', 50_000, 60_000, -10_000],
      ['2026-03-01', 50_000, 0, 50_000],
      ['2026-02-01', null, 1, null],
    ]);
    expect(body.past.map((p) => p.elapsedPercent)).toEqual([100, 100, 100]);
  });

  it('récurrences exclues si la version le demande, autres devises signalées (F-LIM-05)', async () => {
    const t = await tenant();
    await client.limit(t, '2026-05-01', 10_000, { includeRecurring: false });
    await client.spend(t, '2026-05-02', 1_000);
    await client.spend(t, '2026-05-02', 4_000, { source: 'recurrence' });
    await client.spend(t, '2026-05-02', 500, { currency: 'USD' });
    expect((await client.current(t)).current).toMatchObject({
      includeRecurring: false,
      spent: 1_000,
      otherCurrencies: ['USD'],
    });
  });

  it('semaine du lundi : mardi 12 mai → 11–17 mai', async () => {
    const t = await tenant();
    await client.limit(t, '2026-05-04', 20_000, { periodKind: 'week' });
    await client.spend(t, '2026-05-10', 300); // dimanche : semaine précédente
    await client.spend(t, '2026-05-11', 200);
    const body = await client.current(t, '?past=1');
    expect(body.current).toMatchObject({
      start: '2026-05-11',
      end: '2026-05-17',
      spent: 200,
      elapsedDays: 2,
      totalDays: 7,
      elapsedPercent: 28,
    });
    expect(body.past[0]).toMatchObject({ start: '2026-05-04', end: '2026-05-10', spent: 300 });
  });

  it.each(['?past=25', '?past=-1', '?past=abc', '?past=1e1', '?past=', '?foo=1', '?past=1&past=2'])(
    'paramètre invalide %s → 400',
    async (query) => {
      const t = await tenant();
      const res = await client.get(t, query);
      expect(res.status).toBe(400);
    },
  );

  it('past=24 accepté (borne)', async () => {
    const t = await tenant();
    expect((await client.current(t, '?past=24')).past).toHaveLength(24);
  });
});
