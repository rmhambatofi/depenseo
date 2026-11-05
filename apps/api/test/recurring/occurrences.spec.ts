// Échéances (F-REC-03, ADR-032) : ajuster, payer (dépense `recurrence`), sauter ; prochaines
// échéances du tableau de bord (F-TB-01) ; avancée de l'horizon par la tâche périodique ; sync.
// Horloge : décembre 2026 (tâche de génération : mars 2025, plage propre).
import type { INestApplication } from '@nestjs/common';
import { eq, like } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardView } from '../../src/dashboard/dashboard.service.js';
import { category, expense, job, occurrence, recurringExpense } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { generateDueOccurrences } from '../../src/recurring/occurrence-generation.js';
import type { SyncPage } from '../../src/sync/sync.service.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { auth, expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { summaryClient } from '../support/period-summary.js';
import { type OccurrenceBody, recurringClient } from '../support/recurring.js';
import { createUser } from '../support/users.js';

describe('échéances', () => {
  // 2 décembre 2026, 10:00 UTC ; horizon = 11 janvier 2027.
  const clock = new FakeClock(Date.UTC(2026, 11, 2, 10, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const client = expenseClient(() => app, db, clock);
  const rec = recurringClient(() => app);
  const summary = summaryClient(() => app, db);
  const json = (res: { body: unknown }) => res.body as OccurrenceBody;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  /** Récurrence mensuelle créée ; renvoie le compte, la catégorie et ses échéances. */
  async function monthly(overrides: object = {}) {
    const { t, categoryId } = await client.tenant();
    const body = rec.body(categoryId, overrides);
    expect((await rec.create(t, body)).status).toBe(201);
    return { t, categoryId, id: body.id, occurrences: await rec.occurrences(t, body.id) };
  }

  it('ajuster le montant d’une échéance en attente, puis revenir au montant prévu', async () => {
    const { t, id, occurrences } = await monthly({ amountKind: 'estimated', amount: 6_000 });
    const res = await rec.adjust(t, occurrences[0]!.id, { amount: 7_345 });
    expect(res.status).toBe(200);
    expect(json(res)).toMatchObject({ amount: 7_345, adjusted: true, status: 'pending' });
    // Un changement de montant de la récurrence ne touche pas l'échéance ajustée.
    await rec.patch(t, id, { amount: 6_500 });
    expect((await rec.occurrences(t, id)).map((o) => o.amount)).toEqual([7_345, 6_500]);
    const back = await rec.adjust(t, occurrences[0]!.id, { amount: null });
    expect(json(back)).toMatchObject({ amount: 6_500, adjusted: false });
    for (const body of [{}, { amount: 0 }, { amount: '12' }, { amount: 1, status: 'paid' }]) {
      expect((await rec.adjust(t, occurrences[0]!.id, body)).status, JSON.stringify(body)).toBe(
        400,
      );
    }
    expect((await rec.adjust(t, newId(), { amount: 1 })).status).toBe(404);
  });

  it('payer crée la dépense `recurrence` au montant attendu et à la date d’échéance', async () => {
    const { t, categoryId, occurrences } = await monthly();
    const [first] = occurrences;
    await rec.adjust(t, first!.id, { amount: 86_123 });
    const expenseId = newId();
    const res = await rec.pay(t, first!.id, { expenseId });
    expect(res.status).toBe(200);
    expect(json(res)).toMatchObject({ status: 'paid', amount: 86_123, expenseId });
    const [row] = await client.rowsWithId(expenseId);
    expect(row).toMatchObject({
      notebookId: t.notebookId,
      amount: 86_123,
      currency: 'EUR',
      categoryId,
      spentOn: '2026-12-05',
      note: 'Loyer',
      source: 'recurrence',
      deletedAt: null,
    });
    // Rejeu (même dépense) : sans effet ; autre dépense : 409 ; plus d'ajustement ni de saut.
    expect((await rec.pay(t, first!.id, { expenseId })).status).toBe(200);
    expect((await rec.pay(t, first!.id, { expenseId: newId() })).status).toBe(409);
    expect((await rec.adjust(t, first!.id, { amount: 1 })).status).toBe(409);
    expect((await rec.skip(t, first!.id)).status).toBe(409);
    expect(await db.$count(expense, eq(expense.notebookId, t.notebookId))).toBe(1);
  });

  it('payer vérifie les alertes de limite (seuil franchi → tâche `notify`)', async () => {
    const { t, occurrences } = await monthly({ amount: 8_500 });
    await summary.limit(t, '2026-01-01', 10_000);
    expect((await rec.pay(t, occurrences[0]!.id, { expenseId: newId() })).status).toBe(200);
    const keys = await db
      .select({ key: job.uniqueKey })
      .from(job)
      .where(like(job.uniqueKey, `limit:${t.notebookId}:%`));
    expect(keys.map((k) => k.key)).toEqual([`limit:${t.notebookId}:2026-12-01:80`]);
  });

  it('payer avec le montant réel et une autre date', async () => {
    const { t, occurrences } = await monthly();
    const expenseId = newId();
    const res = await rec.pay(t, occurrences[1]!.id, {
      expenseId,
      amount: 84_000,
      date: '2026-12-30',
    });
    expect(json(res)).toMatchObject({ status: 'paid', amount: 84_000, adjusted: true });
    expect((await client.rowsWithId(expenseId))[0]).toMatchObject({
      amount: 84_000,
      spentOn: '2026-12-30',
    });
  });

  it('payer : identifiant de dépense déjà pris → 409, échéance inchangée', async () => {
    const { t, categoryId, occurrences } = await monthly();
    const taken = newId();
    const created = await client.create(t, {
      id: taken,
      amount: 1,
      categoryId,
      date: '2026-12-01',
    });
    expect(created.status).toBe(201);
    expect((await rec.pay(t, occurrences[0]!.id, { expenseId: taken })).status).toBe(409);
    expect((await rec.occurrences(t, occurrences[0]!.recurringExpenseId))[0]!.status).toBe(
      'pending',
    );
    expect((await rec.pay(t, occurrences[0]!.id, { expenseId: 'x' })).status).toBe(400);
  });

  it('sauter : idempotent ; une échéance sautée ne se paie plus', async () => {
    const { t, occurrences } = await monthly();
    const res = await rec.skip(t, occurrences[0]!.id);
    expect(res.status).toBe(200);
    expect(json(res).status).toBe('skipped');
    expect((await rec.skip(t, occurrences[0]!.id)).status).toBe(200);
    expect((await rec.pay(t, occurrences[0]!.id, { expenseId: newId() })).status).toBe(409);
    expect(await db.$count(expense, eq(expense.notebookId, t.notebookId))).toBe(0);
  });

  it('tableau de bord : échéances en attente sous 31 jours, en retard comprises', async () => {
    const { t, categoryId, occurrences } = await monthly({ startDate: '2026-12-20' });
    const weekly = rec.body(categoryId, { name: 'Panier', frequency: 'weekly', amount: 2_500 });
    weekly.startDate = '2026-12-03';
    await rec.create(t, weekly);
    const weeks = await rec.occurrences(t, weekly.id);
    // Semaine du 3 : en retard ; semaine du 10 : sautée ; du 17 : payée.
    await db
      .update(occurrence)
      .set({ dueDate: '2026-11-26' })
      .where(eq(occurrence.id, weeks[0]!.id));
    await rec.skip(t, weeks[1]!.id);
    await rec.pay(t, weeks[2]!.id, { expenseId: newId() });
    const dashboard = async () => {
      const res = await request(http(app))
        .get(`/api/v1/notebooks/${t.notebookId}/dashboard`)
        .set(auth(t));
      expect(res.status).toBe(200);
      return (res.body as DashboardView).upcoming;
    };
    const upcoming = await dashboard();
    expect(upcoming.map((o) => [o.name, o.dueDate, o.overdue, o.amount])).toEqual([
      ['Panier', '2026-11-26', true, 2_500],
      ['Loyer', '2026-12-20', false, 85_000],
      ['Panier', '2026-12-24', false, 2_500],
      ['Panier', '2026-12-31', false, 2_500],
    ]);
    // 7 janvier 2027 (Panier) : matérialisée (horizon), mais au-delà de la fenêtre de 31 jours.
    expect(weeks.map((o) => o.dueDate)).toContain('2027-01-07');
    expect(occurrences.map((o) => o.dueDate)).toEqual(['2026-12-20']);
    await rec.remove(t, weekly.id);
    expect((await dashboard()).map((o) => o.name)).toEqual(['Loyer']);
  });

  it('synchronisation : récurrences et échéances, suppressions comprises', async () => {
    const { t, id, occurrences } = await monthly();
    await rec.remove(t, id);
    const res = await request(http(app)).get(`/api/v1/notebooks/${t.notebookId}/sync`).set(auth(t));
    expect(res.status).toBe(200);
    const page = res.body as SyncPage;
    expect(
      page.recurringExpenses.map((r) => [r.id, r.name, r.amount, r.deletedAt !== null]),
    ).toEqual([[id, 'Loyer', 85_000, true]]);
    expect(page.recurringExpenses[0]).not.toHaveProperty('generatedThrough');
    expect(page.occurrences.map((o) => [o.id, o.amount, o.deletedAt !== null])).toEqual(
      occurrences.map((o) => [o.id, null, true]),
    );
  });
});

describe('tâche generate-occurrences', () => {
  const { pool, db } = testDb(2);

  afterAll(async () => {
    await pool.promise().end();
  });

  /** Récurrence écrite en base, matérialisée jusqu'à `through` (plage mars 2025, propre). */
  async function insert(t: { notebookId: string }, categoryId: string, values: object) {
    const id = newId();
    const now = new Date(Date.UTC(2025, 2, 1));
    await db.insert(recurringExpense).values({
      id,
      notebookId: t.notebookId,
      name: 'Test',
      amount: 1_000,
      currency: 'EUR',
      amountKind: 'fixed',
      frequency: 'monthly',
      startDate: '2025-01-31',
      categoryId,
      mode: 'confirm',
      generatedThrough: '2025-03-01',
      createdAt: now,
      updatedAt: now,
      ...values,
    });
    return id;
  }
  const dueDates = async (id: string) =>
    (
      await db
        .select({ d: occurrence.dueDate })
        .from(occurrence)
        .where(eq(occurrence.recurringExpenseId, id))
        .orderBy(occurrence.dueDate)
    ).map((r) => r.d);
  const through = async (id: string) =>
    (
      await db
        .select({ v: recurringExpense.generatedThrough })
        .from(recurringExpense)
        .where(eq(recurringExpense.id, id))
    )[0]!.v;

  it('avance l’horizon sans doublon, saute les supprimées, épuise les ponctuelles', async () => {
    // Compte sans connexion : pas de jeton de rafraîchissement daté de 2025 (cf. tokens.spec).
    const t = await createUser(db, new Date(Date.UTC(2025, 2, 1)));
    const [cat] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.notebookId, t.notebookId))
      .limit(1);
    const categoryId = cat!.id;
    {
      const monthlyId = await insert(t, categoryId, {});
      const deletedId = await insert(t, categoryId, { deletedAt: new Date(Date.UTC(2025, 2, 1)) });
      const onceId = await insert(t, categoryId, { frequency: 'once', startDate: '2025-03-20' });
      const task = generateDueOccurrences(1);
      const now = new Date(Date.UTC(2025, 2, 10, 23, 59)); // horizon : 19 avril 2025
      // La tâche parcourt toute la base : n'asserter que sur les récurrences du test.
      await task.run(db, now);
      expect(await dueDates(monthlyId)).toEqual(['2025-03-31']);
      expect(await through(monthlyId)).toBe('2025-04-19');
      expect(await dueDates(deletedId)).toEqual([]);
      expect(await dueDates(onceId)).toEqual(['2025-03-20']);

      // Rejeu au même instant : rien ; un mois plus tard : la suivante (30 avril), sans doublon.
      await task.run(db, now);
      await task.run(db, new Date(Date.UTC(2025, 3, 10)));
      expect(await dueDates(monthlyId)).toEqual(['2025-03-31', '2025-04-30']);
      expect(await dueDates(onceId)).toEqual(['2025-03-20']);
      expect(await through(onceId)).toBe('9999-12-31');
    }
  });
});
