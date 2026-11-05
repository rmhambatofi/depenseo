// Récurrences dans les quatre fuseaux (NF-FMT-05, ADR-032) : la première échéance matérialisée et
// le retard des échéances du tableau de bord suivent « aujourd'hui » dans le fuseau du compte,
// indépendamment du fuseau du processus (`test:tz`).
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardView } from '../../src/dashboard/dashboard.service.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { auth, expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';
import { recurringClient } from '../support/recurring.js';

describe(`Récurrences et fuseaux (TZ=${process.env.TZ ?? 'non défini'})`, () => {
  // Samedi 31 octobre 2026, 23:30 UTC : déjà le 1er novembre à Paris (UTC+1, heure d'hiver depuis
  // le 25 octobre) et à La Réunion (UTC+4) ; encore le 31 octobre à Lisbonne (UTC+0) et à Montréal
  // (UTC−4, passage à l'heure d'hiver le 1er novembre).
  const clock = new FakeClock(Date.UTC(2026, 9, 31, 23, 30, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const client = expenseClient(() => app, db, clock);
  const summary = summaryClient(() => app, db);
  const rec = recurringClient(() => app);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  it.each([
    ['Europe/Paris', '2026-11-30'],
    ['Indian/Reunion', '2026-11-30'],
    ['Europe/Lisbon', '2026-10-31'],
    ['America/Montreal', '2026-10-31'],
  ])('%s : mensuelle du 31 → première échéance %s', async (timeZone, first) => {
    const { t, categoryId } = await client.tenant();
    await summary.setTimeZone(t, timeZone);
    const body = rec.body(categoryId, { startDate: '2026-08-31' });
    expect((await rec.create(t, body)).status).toBe(201);
    expect((await rec.occurrences(t, body.id))[0]!.dueDate).toBe(first);

    const res = await request(http(app))
      .get(`/api/v1/notebooks/${t.notebookId}/dashboard`)
      .set(auth(t));
    const { today, upcoming } = res.body as DashboardView;
    expect(upcoming[0]).toMatchObject({ dueDate: first, overdue: false });
    expect(today <= first).toBe(true);
  });

  it('ponctuelle datée du 31 octobre : refusée à Paris (passée), acceptée à Montréal', async () => {
    const paris = await client.tenant();
    const montreal = await client.tenant();
    await summary.setTimeZone(paris.t, 'Europe/Paris');
    await summary.setTimeZone(montreal.t, 'America/Montreal');
    const once = { frequency: 'once', startDate: '2026-10-31' };
    expect((await rec.create(paris.t, rec.body(paris.categoryId, once))).status).toBe(422);
    expect((await rec.create(montreal.t, rec.body(montreal.categoryId, once))).status).toBe(201);
  });
});
