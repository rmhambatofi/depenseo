// Jauge de limite multi-fuseaux (NF-FMT-04/05, ADR-028) : « aujourd'hui » et la période en cours
// dépendent du fuseau du compte, jamais de celui du serveur (suite lancée sous 4 TZ par `test:tz`).
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';

describe('jauge de limite dans le fuseau du compte (NF-FMT-04/05)', () => {
  const clock = new FakeClock();
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const client = summaryClient(() => app, db);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  /** Place l'horloge à l'instant donné puis ouvre un compte dans le fuseau donné. */
  const tenantAt = async (epochMs: number, timeZone: string) => {
    clock.advance(epochMs - clock.now().getTime());
    const t = await createTenant(app, db, clock.now());
    await client.setTimeZone(t, timeZone);
    return t;
  };

  // 2026-03-31 23:30 UTC : déjà le 1er avril à Paris (CEST), Lisbonne (WEST), La Réunion ;
  // encore le 31 mars à Montréal (EDT).
  it.each([
    ['Europe/Paris', '2026-04-01', '2026-04-01', 0],
    ['Europe/Lisbon', '2026-04-01', '2026-04-01', 0],
    ['Indian/Reunion', '2026-04-01', '2026-04-01', 0],
    ['America/Montreal', '2026-03-31', '2026-03-01', 7_000],
  ])('changement de mois, %s → aujourd’hui %s', async (tz, today, start, spent) => {
    const t = await tenantAt(Date.UTC(2026, 2, 31, 23, 30), tz);
    await client.limit(t, '2026-03-01', 10_000);
    await client.spend(t, '2026-03-31', 7_000);
    const body = await client.current(t, '?past=1');
    expect(body).toMatchObject({ timeZone: tz, today });
    expect(body.current).toMatchObject({ start, spent });
    // Le 31 mars est toujours compté une fois, dans la période en cours ou la précédente.
    expect(body.current.spent + body.past[0]!.spent).toBe(7_000);
  });

  // Changement d'heure de printemps à Paris le dimanche 29 mars 2026 à 01:00 UTC. 22:30 UTC le 29
  // = 00:30 lundi 30 en CEST (+2) ; avec l'ancien décalage (+1), on serait encore dimanche.
  it('semaine, lendemain du passage à l’heure d’été (Paris)', async () => {
    const t = await tenantAt(Date.UTC(2026, 2, 29, 22, 30), 'Europe/Paris');
    await client.limit(t, '2026-03-16', 5_000, { periodKind: 'week' });
    const body = await client.current(t);
    expect(body.today).toBe('2026-03-30');
    expect(body.current).toMatchObject({ start: '2026-03-30', end: '2026-04-05', elapsedDays: 1 });
  });

  // Montréal passe à l'heure d'été le dimanche 8 mars 2026. 04:30 UTC le 9 = 00:30 lundi en EDT
  // (−4) ; en EST (−5) ce serait 23:30 dimanche.
  it('semaine, lendemain du passage à l’heure d’été (Montréal)', async () => {
    const t = await tenantAt(Date.UTC(2026, 2, 9, 4, 30), 'America/Montreal');
    await client.limit(t, '2026-03-02', 5_000, { periodKind: 'week' });
    expect((await client.current(t)).current).toMatchObject({
      start: '2026-03-09',
      end: '2026-03-15',
    });
  });

  // Retour à l'heure d'hiver à Paris le 25 octobre 2026. 22:30 UTC le 31 = 23:30 en CET (+1) :
  // encore octobre (en CEST, +2, ce serait déjà novembre).
  it('mois, après le passage à l’heure d’hiver (Paris)', async () => {
    const t = await tenantAt(Date.UTC(2026, 9, 31, 22, 30), 'Europe/Paris');
    const body = await client.current(t);
    expect(body.today).toBe('2026-10-31');
    expect(body.current).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(body.current.elapsedPercent).toBe(100);
  });

  // La Réunion (+4, sans heure d'été) : 20:30 UTC le dimanche 10 mai = 00:30 lundi 11.
  it('semaine du jeudi à La Réunion', async () => {
    const t = await tenantAt(Date.UTC(2026, 4, 10, 20, 30), 'Indian/Reunion');
    await client.limit(t, '2026-05-01', 5_000, { periodKind: 'week', startDay: 4 });
    const body = await client.current(t);
    expect(body.today).toBe('2026-05-11');
    expect(body.current).toMatchObject({ start: '2026-05-07', end: '2026-05-13', elapsedDays: 5 });
  });
});
