// Tableau de bord dans les quatre fuseaux (NF-FMT-05, ADR-031) : « aujourd'hui » et donc la
// période en cours suivent le fuseau du compte, indépendamment du fuseau du processus (`test:tz`).
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { dashboardClient } from '../support/dashboard.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';

describe(`Tableau de bord et fuseaux (TZ=${process.env.TZ ?? 'non défini'})`, () => {
  // Samedi 31 octobre 2026, 23:30 UTC : déjà le 1er novembre à Paris (UTC+1, heure d'hiver depuis
  // le 25 octobre) et à La Réunion (UTC+4) ; encore le 31 octobre à Lisbonne (UTC+0) et à Montréal
  // (UTC−4, heure d'été jusqu'au 1er novembre).
  const clock = new FakeClock(Date.UTC(2026, 9, 31, 23, 30, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const board = dashboardClient(() => app, db);
  const summary = summaryClient(() => app, db);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  it.each([
    ['Europe/Paris', '2026-11-01'],
    ['Indian/Reunion', '2026-11-01'],
    ['Europe/Lisbon', '2026-10-31'],
    ['America/Montreal', '2026-10-31'],
  ])('%s : aujourd’hui = %s, période et cumuls en conséquence', async (timeZone, today) => {
    const t = await createTenant(app, db, clock.now());
    await summary.setTimeZone(t, timeZone);
    const [root] = (await board.plan(t)).roots;
    await board.spend(t, root!.subs[0]!, '2026-10-24', 1_000); // veille du passage à l'heure d'hiver
    await board.spend(t, root!.subs[0]!, '2026-10-26', 500); // lendemain
    await board.spend(t, root!.subs[0]!, '2026-11-01', 200);
    const d = await board.dashboard(t);
    expect(d.timeZone).toBe(timeZone);
    expect(d.today).toBe(today);
    const october = { start: '2026-10-01', end: '2026-10-31' };
    const november = { start: '2026-11-01', end: '2026-11-30' };
    if (today === '2026-11-01') {
      expect(d.gauge).toMatchObject({ ...november, spent: 200 });
      expect(d.cumulative.current).toEqual([{ day: 1, date: '2026-11-01', cumulative: 200 }]);
      expect(d.cumulative.previous).toHaveLength(31);
      expect(d.cumulative.previous.slice(23, 26).map((p) => p.cumulative)).toEqual([
        1_000, 1_000, 1_500,
      ]);
      expect(d.evolution[1]).toMatchObject({ ...october, spent: 1_500 });
    } else {
      expect(d.gauge).toMatchObject({ ...october, spent: 1_500 });
      expect(d.cumulative.current).toHaveLength(31);
      expect(d.cumulative.current.at(-1)!.cumulative).toBe(1_500);
      expect(d.cumulative.previous).toHaveLength(30);
      expect(d.evolution.at(-1)!.start).toBe('2025-11-01');
    }
  });
});
