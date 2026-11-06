// Dépenses (F-DEP-03, NF-OFF-01, NF-FMT-01/02, ADR-024) : création idempotente par UUID client,
// lecture, modification, validation, étiquettes. Cycle de vie : `expenses-lifecycle.spec.ts`.
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expenseTag, tag, user } from '../../src/db/schema/index.js';
import { newId, uuidToBinary } from '../../src/db/uuid.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { expenseClient, json } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

describe('dépenses (F-DEP-03)', () => {
  const clock = new FakeClock(Date.UTC(2026, 3, 10, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const { create, getOne, patch, categories, someCategory, tenant, rowsWithId } = expenseClient(
    () => app,
    db,
    clock,
  );

  it('crée une dépense (201), relue identique ; la date calendaire n’est jamais décalée', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    const res = await create(t, {
      id,
      amount: 4250,
      categoryId,
      date: '2026-03-29',
      note: '  Plein  ',
      merchant: 'Station',
      tags: ['Vacances'],
    });
    expect(res.status).toBe(201);
    expect(json(res)).toEqual({
      id,
      amount: 4250,
      currency: 'EUR',
      categoryId,
      date: '2026-03-29',
      note: 'Plein',
      merchant: 'Station',
      tags: ['Vacances'],
      source: 'manual',
      createdAt: clock.now().toISOString(),
      updatedAt: clock.now().toISOString(),
    });
    expect(json(await getOne(t, id).expect(200))).toEqual(json(res));
    // En base : DATE intacte (jour du passage à l'heure d'été en Europe), BIGINT en centimes.
    const [raw] = (await db.execute(
      sql`select cast(spent_on as char) as d, amount from expense where id = ${uuidToBinary(id)}`,
    )) as unknown as [Array<{ d: string; amount: number | string }>];
    expect(raw[0]).toMatchObject({ d: '2026-03-29' });
    expect(Number(raw[0]!.amount)).toBe(4250);
  });

  it('devise par défaut = celle du compte ; devise explicite acceptée si connue', async () => {
    const { t, categoryId } = await tenant();
    await db.update(user).set({ currency: 'CHF' }).where(eq(user.id, t.id));
    const implicit = await create(t, { id: newId(), amount: 100, categoryId, date: '2026-04-01' });
    expect(json(implicit).currency).toBe('CHF');
    const explicit = await create(t, {
      id: newId(),
      amount: 100,
      currency: 'EUR',
      categoryId,
      date: '2026-04-01',
    });
    expect(json(explicit).currency).toBe('EUR');
    const unknown = await create(t, {
      id: newId(),
      amount: 100,
      currency: 'XXX',
      categoryId,
      date: '2026-04-01',
    });
    expect(unknown.status).toBe(400);
  });

  it('double envoi : une seule ligne, la première écriture gagne (NF-OFF-01)', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    const body = { id, amount: 1200, categoryId, date: '2026-04-02', tags: ['a'] };
    const first = await create(t, body);
    clock.advance(1000);
    const replay = await create(t, { ...body, amount: 9999, tags: ['b'] });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(json(replay)).toEqual(json(first));
    expect(await rowsWithId(id)).toHaveLength(1);
  });

  it('double envoi simultané : une seule ligne, mêmes réponses', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    const body = { id, amount: 700, categoryId, date: '2026-04-03', tags: ['x', 'y'] };
    const [a, b] = await Promise.all([create(t, body), create(t, body)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(json(a)).toEqual(json(b));
    expect(await rowsWithId(id)).toHaveLength(1);
    expect(await db.select().from(expenseTag).where(eq(expenseTag.expenseId, id))).toHaveLength(2);
  });

  it.each([
    ['non entier', 12.5],
    ['chaîne', '1250'],
    ['nul', 0],
    ['négatif', -100],
    ['au-delà du maximum', 100_000_000_000],
    ['non sûr', 2 ** 53 + 2],
  ])('montant %s → 400, rien n’est écrit', async (_label, amount) => {
    const { t, categoryId } = await tenant();
    const id = newId();
    const res = await create(t, { id, amount, categoryId, date: '2026-04-04' });
    expect(res.status).toBe(400);
    expect(json(res).detail).toContain('amount');
    expect(await rowsWithId(id)).toHaveLength(0);
  });

  it.each(['2026-02-30', '2026-3-29', '29/03/2026', '2026-03-29T00:00:00Z', ''])(
    'date invalide %j → 400',
    async (date) => {
      const { t, categoryId } = await tenant();
      const res = await create(t, { id: newId(), amount: 100, categoryId, date });
      expect(res.status).toBe(400);
      expect(json(res).detail).toContain('date');
    },
  );

  it('corps strict : `source`, champ inconnu, UUID non v7, note trop longue → 400', async () => {
    const { t, categoryId } = await tenant();
    const valid = { amount: 100, categoryId, date: '2026-04-05' };
    for (const body of [
      { ...valid, id: newId(), source: 'recurrence' },
      { ...valid, id: newId(), paymentMethod: 'card' },
      { ...valid, id: '00000000-0000-4000-8000-000000000000' },
      { ...valid, id: newId(), note: 'n'.repeat(501) },
      { ...valid, id: newId(), merchant: 'm'.repeat(101) },
      { ...valid, id: newId(), tags: ['t'.repeat(51)] },
      { ...valid, id: newId(), tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
      { ...valid, id: newId(), tags: ['  '] },
    ]) {
      expect((await create(t, body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
  });

  it('dépense sur une catégorie masquée : acceptée et conservée (ADR-023)', async () => {
    const { t, categoryId } = await tenant();
    await categories(t, 'patch', `/${categoryId}`, { hidden: true }).expect(200);
    const id = newId();
    const res = await create(t, { id, amount: 300, categoryId, date: '2026-04-06' });
    expect(res.status).toBe(201);
    expect(json(await getOne(t, id).expect(200)).categoryId).toBe(categoryId);
    const moved = await patch(t, id, { amount: 301 });
    expect(json(moved).categoryId).toBe(categoryId);
  });

  it('catégorie inconnue, d’un autre carnet ou supprimée → 422', async () => {
    const { t } = await tenant();
    const other = await tenant();
    const custom = newId();
    await categories(t, 'post', '', {
      id: custom,
      name: 'Éphémère',
      icon: '⏳',
      color: '#000000',
    }).expect(201);
    await categories(t, 'delete', `/${custom}`).expect(204);
    for (const categoryId of [newId(), other.categoryId, custom]) {
      const id = newId();
      const res = await create(t, { id, amount: 100, categoryId, date: '2026-04-07' });
      expect(res.status, categoryId).toBe(422);
      expect(await rowsWithId(id)).toHaveLength(0);
    }
    const { categoryId } = { categoryId: await someCategory(t) };
    const id = newId();
    await create(t, { id, amount: 100, categoryId, date: '2026-04-07' }).expect(201);
    expect((await patch(t, id, { categoryId: other.categoryId })).status).toBe(422);
    expect((await patch(t, id, { categoryId: custom })).status).toBe(422);
  });

  it('étiquettes : dédoublonnées par nom (casse, accents), partagées entre dépenses', async () => {
    const { t, categoryId } = await tenant();
    const first = await create(t, {
      id: newId(),
      amount: 100,
      categoryId,
      date: '2026-04-08',
      tags: [' Été ', 'ete', 'Travail'],
    });
    expect(json(first).tags).toEqual(['Été', 'Travail']);
    const second = await create(t, {
      id: newId(),
      amount: 100,
      categoryId,
      date: '2026-04-08',
      tags: ['ÉTÉ'],
    });
    // Le nom enregistré en premier fait foi.
    expect(json(second).tags).toEqual(['Été']);
    const tags = await db.select().from(tag).where(eq(tag.notebookId, t.notebookId));
    expect(tags.map((row) => row.name).sort()).toEqual(['Travail', 'Été']);
  });

  it('étiquette supprimée puis réutilisée : restaurée, `updated_at` avance ; les autres intactes', async () => {
    const { t, categoryId } = await tenant();
    const expense = (tags: string[]) =>
      create(t, { id: newId(), amount: 100, categoryId, date: '2026-04-08', tags });
    await expense(['Été', 'Travail']);
    const created = clock.now();
    await db
      .update(tag)
      .set({ deletedAt: created })
      .where(and(eq(tag.notebookId, t.notebookId), eq(tag.name, 'Été')));
    clock.advance(60_000);
    expect(json(await expense(['ete', 'Travail'])).tags).toEqual(['Été', 'Travail']);
    const rows = await db.select().from(tag).where(eq(tag.notebookId, t.notebookId));
    const byName = new Map(rows.map((row) => [row.name, row]));
    expect(byName.get('Été')).toMatchObject({ deletedAt: null, updatedAt: clock.now() });
    // Étiquette vivante réutilisée : aucune écriture, pas de renvoi inutile par la synchro.
    expect(byName.get('Travail')).toMatchObject({ deletedAt: null, updatedAt: created });
  });

  it('modification partielle : champs, étiquettes remplacées, `updated_at` avance', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    const created = json(
      await create(t, {
        id,
        amount: 100,
        categoryId,
        date: '2026-04-09',
        note: 'avant',
        tags: ['a', 'b'],
      }),
    );
    clock.advance(60_000);
    const res = await patch(t, id, {
      amount: 250,
      note: null,
      merchant: 'Boulangerie',
      tags: ['c'],
    });
    expect(res.status).toBe(200);
    expect(json(res)).toEqual({
      ...created,
      amount: 250,
      note: null,
      merchant: 'Boulangerie',
      tags: ['c'],
      updatedAt: clock.now().toISOString(),
    });
    expect(json(await patch(t, id, { tags: [] })).tags).toEqual([]);
    expect(await db.select().from(expenseTag).where(eq(expenseTag.expenseId, id))).toHaveLength(0);
    for (const body of [{}, { source: 'recurrence' }, { amount: 1.5 }, { date: '2026-02-29' }]) {
      expect((await patch(t, id, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await patch(t, newId(), { amount: 1 })).status).toBe(404);
    expect((await patch(t, 'pas-un-uuid', { amount: 1 })).status).toBe(404);
  });

  it('identifiant déjà pris dans un autre carnet → 409, la ligne d’origine est intacte', async () => {
    const a = await tenant();
    const b = await tenant();
    const id = newId();
    await create(a.t, { id, amount: 100, categoryId: a.categoryId, date: '2026-04-11' }).expect(
      201,
    );
    const res = await create(b.t, { id, amount: 1, categoryId: b.categoryId, date: '2026-04-11' });
    expect(res.status).toBe(409);
    const [row] = await rowsWithId(id);
    expect(row).toMatchObject({ amount: 100 });
    expect(
      await db
        .select()
        .from(tag)
        .where(inArray(tag.notebookId, [b.t.notebookId])),
    ).toHaveLength(0);
  });
  it('noms d’étiquettes, note et marchand normalisés en NFC', async () => {
    const { t, categoryId } = await tenant();
    const decomposed = 'Cafe\u0301';
    const res = await create(t, {
      id: newId(),
      amount: 300,
      categoryId,
      date: '2026-04-14',
      note: decomposed,
      merchant: decomposed,
      tags: [decomposed],
    });
    expect(json(res)).toMatchObject({
      note: 'Caf\u00e9',
      merchant: 'Caf\u00e9',
      tags: ['Caf\u00e9'],
    });
  });
});
