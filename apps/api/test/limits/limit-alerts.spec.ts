// Alertes de limite (F-LIM-04, F-NOT-01, ADR-004, ADR-029) : à chaque écriture de dépense, une
// tâche `notify` est créée dans la même transaction quand la période en cours franchit 80 %, 100 %,
// 110 %, 120 %… de la limite ; une seule alerte par seuil et par période, sans aucun montant.
import type { INestApplication } from '@nestjs/common';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { job, limitAlert } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { thresholdReached } from '../../src/limits/limit-alerts.js';
import { createTenant, type Tenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';

describe('thresholdReached (ADR-004)', () => {
  it.each([
    [null, null],
    [0, null],
    [79, null],
    [80, 80],
    [99, 80],
    [100, 100],
    [109, 100],
    [110, 110],
    [135, 130],
    [199, 190],
    [200, 200],
    [65_600, 200],
  ])('%s %% → %s', (percent, expected) => {
    expect(thresholdReached(percent)).toBe(expected);
  });
});

describe('Alertes de limite à l’écriture d’une dépense (F-LIM-04)', () => {
  // 2026-07-15 10:00 UTC : mercredi 15 juillet dans les quatre fuseaux.
  const clock = new FakeClock(Date.UTC(2026, 6, 15, 10, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const expenses = expenseClient(() => app, db, clock);
  const summary = summaryClient(() => app, db);

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  beforeEach(() => clock.set(Date.UTC(2026, 6, 15, 10, 0, 0)));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const tenant = () => createTenant(app, db, clock.now());

  /** Clés `limit:` du carnet, triées. */
  async function alertKeys(t: Tenant) {
    const rows = await db
      .select({ key: job.uniqueKey })
      .from(job)
      .where(like(job.uniqueKey, `limit:${t.notebookId}:%`));
    return rows.map((r) => r.key).sort();
  }

  async function spend(t: Tenant, amount: number, date = '2026-07-10') {
    const id = newId();
    const res = await expenses.create(t, {
      id,
      amount,
      categoryId: await expenses.someCategory(t),
      date,
    });
    expect(res.status).toBe(201);
    return id;
  }

  const key = (t: Tenant, start: string, threshold: number) =>
    `limit:${t.notebookId}:${start}:${threshold}`;

  it('80 % franchi : une tâche notify sans montant, dans la période en cours', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    await spend(t, 7_999);
    expect(await alertKeys(t)).toEqual([]);
    await spend(t, 1);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 80)]);
    const [row] = await db
      .select()
      .from(job)
      .where(eq(job.uniqueKey, key(t, '2026-07-01', 80)));
    expect(row!.type).toBe('notify');
    expect(row!.status).toBe('pending');
    expect(JSON.parse(row!.payload)).toEqual({
      kind: 'limit',
      notebookId: t.notebookId,
      periodStart: '2026-07-01',
      threshold: 80,
    });
  });

  it('franchir 80 % deux fois dans la période → une seule alerte', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    const first = await spend(t, 8_500);
    expect((await expenses.remove(t, first)).status).toBe(204);
    await spend(t, 8_200);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 80)]);
  });

  it('100 %, 110 %, 120 % → alertes distinctes', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    await spend(t, 8_000);
    await spend(t, 2_000);
    await spend(t, 1_000);
    await spend(t, 500);
    await spend(t, 500);
    expect(await alertKeys(t)).toEqual([
      key(t, '2026-07-01', 100),
      key(t, '2026-07-01', 110),
      key(t, '2026-07-01', 120),
      key(t, '2026-07-01', 80),
    ]);
  });

  it('saut direct à 135 % : seul le seuil atteint le plus haut, pas de retour vers le bas', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    const big = await spend(t, 13_500);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 130)]);
    expect((await expenses.remove(t, big)).status).toBe(204);
    await spend(t, 11_500);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 130)]);
    const [state] = await db
      .select({ threshold: limitAlert.threshold })
      .from(limitAlert)
      .where(
        and(eq(limitAlert.notebookId, t.notebookId), eq(limitAlert.periodStart, '2026-07-01')),
      );
    expect(state!.threshold).toBe(130);
  });

  it('limite de 1 centime et grosse dépense : 201, une seule alerte plafonnée à 200 %', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 1);
    await spend(t, 99_999_999_999);
    await spend(t, 1_000);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 200)]);
  });

  it('écriture refusée (catégorie invalide, 422) : aucune alerte', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    const res = await expenses.create(t, {
      id: newId(),
      amount: 9_000,
      categoryId: newId(),
      date: '2026-07-10',
    });
    expect(res.status).toBe(422);
    expect(await alertKeys(t)).toEqual([]);
  });

  it('limite hebdomadaire (lundi → dimanche) : seuls les jours de la semaine en cours comptent', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000, { periodKind: 'week', startDay: 1 });
    await spend(t, 5_000, '2026-07-12'); // dimanche : semaine précédente
    await spend(t, 7_000, '2026-07-13'); // lundi
    expect(await alertKeys(t)).toEqual([]);
    await spend(t, 1_000, '2026-07-19'); // dimanche de la semaine en cours
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-13', 80)]);
  });

  it('période suivante : les seuils repartent de zéro', async () => {
    // Jeton d'accès de 15 min : bascule de minuit à Paris en 10 min (23:55 → 00:05).
    clock.set(Date.UTC(2026, 6, 31, 21, 55, 0));
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    await spend(t, 9_000, '2026-07-31');
    clock.set(Date.UTC(2026, 6, 31, 22, 5, 0));
    await spend(t, 9_000, '2026-08-01');
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 80), key(t, '2026-08-01', 80)]);
  });

  it('sans limite, ou dépense dans une période passée → aucune alerte', async () => {
    const free = await tenant();
    await spend(free, 1_000_000);
    expect(await alertKeys(free)).toEqual([]);
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    await spend(t, 50_000, '2026-06-30');
    expect(await alertKeys(t)).toEqual([]);
  });

  it('limite « aucune limite » (montant NULL) en vigueur → aucune alerte', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    await summary.limit(t, '2026-07-01', null);
    await spend(t, 50_000);
    expect(await alertKeys(t)).toEqual([]);
  });

  it('modification et restauration déclenchent aussi la détection', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    const id = await spend(t, 1_000);
    expect((await expenses.patch(t, id, { amount: 8_000 })).status).toBe(200);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 80)]);
    const other = await spend(t, 1_000);
    expect((await expenses.remove(t, other)).status).toBe(204);
    expect((await expenses.patch(t, id, { amount: 9_500 })).status).toBe(200);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 80)]);
    expect((await expenses.restore(t, other)).status).toBe(200);
    expect(await alertKeys(t)).toEqual([key(t, '2026-07-01', 100), key(t, '2026-07-01', 80)]);
  });

  it('dépenses d’un autre carnet ignorées', async () => {
    const t = await tenant();
    const other = await tenant();
    await summary.limit(t, '2026-01-01', 10_000);
    await summary.spend(other, '2026-07-10', 9_000);
    await spend(t, 7_000);
    expect(await alertKeys(t)).toEqual([]);
    expect(await alertKeys(other)).toEqual([]);
  });

  it('récurrences exclues par la limite : pas comptées pour le seuil', async () => {
    const t = await tenant();
    await summary.limit(t, '2026-01-01', 10_000, { includeRecurring: false });
    await summary.spend(t, '2026-07-02', 9_000, { source: 'recurrence' });
    await spend(t, 1_000);
    expect(await alertKeys(t)).toEqual([]);
  });

  // NF-FMT-05 : la période en cours dépend du fuseau du compte. 2026-07-31 23:30 UTC = 1er août
  // à Paris (01:30), Lisbonne (00:30, heure d'été UTC+1) et La Réunion (03:30) ; 31 juillet à
  // Montréal (19:30).
  describe.each([
    ['Europe/Paris', '2026-08-01'],
    ['Europe/Lisbon', '2026-08-01'],
    ['America/Montreal', '2026-07-01'],
    ['Indian/Reunion', '2026-08-01'],
  ])('fuseau %s', (timeZone, currentStart) => {
    it(`une dépense du 31 juillet n'alerte que si juillet est la période en cours`, async () => {
      clock.set(Date.UTC(2026, 6, 31, 23, 30, 0));
      const t = await tenant();
      await summary.setTimeZone(t, timeZone);
      await summary.limit(t, '2026-01-01', 10_000);
      await spend(t, 9_000, '2026-07-31');
      expect(await alertKeys(t)).toEqual(
        currentStart === '2026-07-01' ? [key(t, '2026-07-01', 80)] : [],
      );
    });
  });

  it('changement d’heure (Paris, 25 octobre 2026) : période d’octobre jusqu’à minuit local', async () => {
    // 2026-10-31 22:30 UTC = 23:30 à Paris (heure d'hiver depuis le 25) : encore octobre.
    clock.set(Date.UTC(2026, 9, 31, 22, 30, 0));
    const t = await tenant();
    await summary.setTimeZone(t, 'Europe/Paris');
    await summary.limit(t, '2026-01-01', 10_000);
    await spend(t, 8_000, '2026-10-25');
    expect(await alertKeys(t)).toEqual([key(t, '2026-10-01', 80)]);
  });
});
