// Dépenses récurrentes (F-REC-01, ADR-032) : création idempotente, matérialisation des échéances
// à partir d'aujourd'hui jusqu'à l'horizon, modification, suppression. Horloge : décembre 2026.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { occurrence, recurringExpense } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { type RecurringBody, recurringClient } from '../support/recurring.js';

describe('dépenses récurrentes', () => {
  // 2 décembre 2026, 10:00 UTC (11:00 à Paris) ; horizon = 11 janvier 2027.
  const clock = new FakeClock(Date.UTC(2026, 11, 2, 10, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  const client = expenseClient(() => app, db, clock);
  const rec = recurringClient(() => app);
  const json = (res: { body: unknown }) => res.body as RecurringBody;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  it('crée une récurrence et ses échéances jusqu’à l’horizon ; rejeu idempotent', async () => {
    const { t, categoryId } = await client.tenant();
    const body = rec.body(categoryId);
    const res = await rec.create(t, body);
    expect(res.status).toBe(201);
    expect(json(res)).toMatchObject({
      id: body.id,
      name: 'Loyer',
      amount: 85_000,
      currency: 'EUR',
      amountKind: 'fixed',
      frequency: 'monthly',
      startDate: '2026-12-05',
      categoryId,
      mode: 'confirm',
    });
    const occurrences = await rec.occurrences(t, body.id);
    expect(occurrences.map((o) => [o.dueDate, o.status, o.amount, o.adjusted])).toEqual([
      ['2026-12-05', 'pending', 85_000, false],
      ['2027-01-05', 'pending', 85_000, false],
    ]);
    expect(occurrences[0]).toMatchObject({ name: 'Loyer', currency: 'EUR', expenseId: null });

    const replay = await rec.create(t, { ...body, name: 'Autre', amount: 1 });
    expect(replay.status).toBe(201);
    expect(json(replay)).toMatchObject({ name: 'Loyer', amount: 85_000 });
    expect(await rec.occurrences(t, body.id)).toHaveLength(2);

    const other = await client.tenant();
    const stolen = await rec.create(other.t, { ...body, categoryId: other.categoryId });
    expect(stolen.status).toBe(409);
    expect((await rec.list(t)).body).toHaveLength(1);
  });

  it('date de départ passée : aucune échéance passée, le jour du mois est conservé', async () => {
    const { t, categoryId } = await client.tenant();
    const body = rec.body(categoryId, { startDate: '2026-10-31', amountKind: 'estimated' });
    expect((await rec.create(t, body)).status).toBe(201);
    expect((await rec.occurrences(t, body.id)).map((o) => o.dueDate)).toEqual(['2026-12-31']);
  });

  it('annuelle au-delà de l’horizon : sa prochaine échéance existe déjà', async () => {
    const { t, categoryId } = await client.tenant();
    const body = rec.body(categoryId, { frequency: 'yearly', startDate: '2027-06-15' });
    expect((await rec.create(t, body)).status).toBe(201);
    expect((await rec.occurrences(t, body.id)).map((o) => o.dueDate)).toEqual(['2027-06-15']);
    const [row] = await db
      .select({ through: recurringExpense.generatedThrough })
      .from(recurringExpense)
      .where(eq(recurringExpense.id, body.id));
    expect(row!.through).toBe('2027-06-15');
  });

  it('ponctuelle : une échéance ; passée → 422', async () => {
    const { t, categoryId } = await client.tenant();
    const once = rec.body(categoryId, { frequency: 'once', startDate: '2026-12-02', mode: 'auto' });
    expect((await rec.create(t, once)).status).toBe(201);
    expect((await rec.occurrences(t, once.id)).map((o) => o.dueDate)).toEqual(['2026-12-02']);
    const past = rec.body(categoryId, { frequency: 'once', startDate: '2026-12-01' });
    expect((await rec.create(t, past)).status).toBe(422);
    expect((await rec.getOne(t, past.id)).status).toBe(404);
  });

  it('corps invalides → 400 ; catégorie d’un autre carnet → 422', async () => {
    const { t, categoryId } = await client.tenant();
    const other = await client.tenant();
    for (const overrides of [
      { frequency: 'daily' },
      { amount: 0 },
      { amount: 12.5 },
      { name: '  ' },
      { startDate: '2026-02-30' },
      { mode: 'manual' },
      { id: 'pas-un-uuid' },
      { generatedThrough: '2030-01-01' },
    ]) {
      const res = await rec.create(t, rec.body(categoryId, overrides));
      expect(res.status, JSON.stringify(overrides)).toBe(400);
    }
    expect((await rec.create(t, rec.body(other.categoryId))).status).toBe(422);
    expect((await rec.list(t)).body).toEqual([]);
  });

  it('PATCH : nom, montant, mode ; les échéances en attente suivent ; calendrier immuable', async () => {
    const { t, categoryId } = await client.tenant();
    const body = rec.body(categoryId);
    await rec.create(t, body);
    clock.advance(1000);
    const res = await rec.patch(t, body.id, { name: ' Loyer T3 ', amount: 90_000, mode: 'auto' });
    expect(res.status).toBe(200);
    expect(json(res)).toMatchObject({ name: 'Loyer T3', amount: 90_000, mode: 'auto' });
    expect((await rec.occurrences(t, body.id)).map((o) => [o.name, o.amount])).toEqual([
      ['Loyer T3', 90_000],
      ['Loyer T3', 90_000],
    ]);
    expect((await rec.patch(t, body.id, { name: 'X', frequency: 'weekly' })).status).toBe(400);
    expect((await rec.patch(t, body.id, { name: 'X', startDate: '2027-01-01' })).status).toBe(400);
    expect((await rec.patch(t, body.id, {})).status).toBe(400);
    expect((await rec.patch(t, newId(), { name: 'X' })).status).toBe(404);
  });

  it('catégorie d’une récurrence active : suppression refusée (409)', async () => {
    const { t, categoryId } = await client.tenant();
    const custom = { id: newId(), name: 'Assurances', icon: '🛡️', color: '#123456' };
    expect((await client.categories(t, 'post', '', custom)).status).toBe(201);
    const body = rec.body(custom.id);
    await rec.create(t, body);
    expect((await client.categories(t, 'delete', `/${custom.id}`)).status).toBe(409);
    await rec.patch(t, body.id, { categoryId });
    expect((await client.categories(t, 'delete', `/${custom.id}`)).status).toBe(204);
    // Catégorie supprimée : refusée pour une récurrence (création comme modification).
    expect((await rec.patch(t, body.id, { categoryId: custom.id })).status).toBe(422);
  });

  it('DELETE : supprime la récurrence et toutes ses échéances ; la dépense payée reste', async () => {
    const { t, categoryId } = await client.tenant();
    const body = rec.body(categoryId);
    await rec.create(t, body);
    const [first, second] = await rec.occurrences(t, body.id);
    const expenseId = newId();
    expect((await rec.pay(t, first!.id, { expenseId })).status).toBe(200);

    expect((await rec.remove(t, body.id)).status).toBe(204);
    expect((await rec.remove(t, body.id)).status).toBe(204);
    expect((await rec.getOne(t, body.id)).status).toBe(404);
    expect((await rec.list(t)).body).toEqual([]);
    expect((await rec.skip(t, second!.id)).status).toBe(404);
    const rows = await db
      .select({ id: occurrence.id, status: occurrence.status, deletedAt: occurrence.deletedAt })
      .from(occurrence)
      .where(eq(occurrence.recurringExpenseId, body.id));
    expect(rows.map((r) => r.deletedAt)).toEqual([clock.now(), clock.now()]);
    expect(rows.find((r) => r.id === first!.id)!.status).toBe('paid');
    expect((await client.getOne(t, expenseId)).status).toBe(200);
    // Rejeu de création d'une récurrence supprimée → 409.
    expect((await rec.create(t, body)).status).toBe(409);
  });
});
