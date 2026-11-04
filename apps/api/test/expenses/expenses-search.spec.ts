// Liste, recherche et filtres combinables des dépenses (F-DEP-09, ADR-025) : texte sur note et
// marchand insensible à la casse et aux accents (collation), montant, catégories, période,
// pagination par curseur sur (date décroissante, id décroissant).
import type { INestApplication } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { category } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { Tenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { type ExpenseBody, expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

interface Page {
  items: ExpenseBody[];
  nextCursor: string | null;
  detail?: string;
}
const page = (res: { body: unknown }) => res.body as Page;

describe('recherche des dépenses (F-DEP-09)', () => {
  const clock = new FakeClock(Date.UTC(2026, 4, 2, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const { create, remove, list, tenant } = expenseClient(() => app, db, clock);

  const twoCategories = async (t: Tenant) => {
    const rows = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.notebookId, t.notebookId), sql`${category.parentId} is not null`))
      .orderBy(asc(category.id))
      .limit(2);
    return rows.map((r) => r.id) as [string, string];
  };

  /** Crée une dépense et renvoie son identifiant. */
  const add = async (t: Tenant, categoryId: string, fields: Record<string, unknown>) => {
    const id = newId();
    await create(t, { id, amount: 1000, categoryId, date: '2026-04-01', ...fields }).expect(201);
    return id;
  };

  const ids = (res: { body: unknown }) => page(res).items.map((e) => e.id);

  it('liste les dépenses actives du carnet seulement, par date puis id décroissants', async () => {
    const { t, categoryId } = await tenant();
    const other = await tenant();
    const a = await add(t, categoryId, { date: '2026-04-01', tags: ['Vacances'] });
    const b = await add(t, categoryId, { date: '2026-04-03' });
    const c = await add(t, categoryId, { date: '2026-04-01' });
    const deleted = await add(t, categoryId, { date: '2026-04-02' });
    await remove(t, deleted).expect(204);
    await add(other.t, other.categoryId, { date: '2026-04-02' });

    const res = await list(t).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(ids(res)).toEqual([b, c, a]);
    expect(page(res).nextCursor).toBeNull();
    const first = page(res).items[2]!;
    expect(first).toMatchObject({ id: a, amount: 1000, currency: 'EUR', date: '2026-04-01' });
    expect(first.tags).toEqual(['Vacances']);
  });

  it('cherche dans la note et le marchand sans tenir compte de la casse ni des accents', async () => {
    const { t, categoryId } = await tenant();
    const inNote = await add(t, categoryId, { note: 'Facture Énergie mars' });
    const inMerchant = await add(t, categoryId, { merchant: 'ÉNERGIES Plus' });
    await add(t, categoryId, { note: 'Boulangerie', merchant: 'Le fournil' });
    await add(t, categoryId, {});

    const res = await list(t, { q: 'energie' }).expect(200);
    expect(ids(res).sort()).toEqual([inNote, inMerchant].sort());
    expect(ids(await list(t, { q: '  ÉNERGIE  ' }).expect(200)).sort()).toEqual(
      [inNote, inMerchant].sort(),
    );
    // Texte vide après retrait des espaces : pas de filtre.
    expect(ids(await list(t, { q: '   ' }).expect(200))).toHaveLength(4);
  });

  it('traite % _ ! et \\ comme du texte, pas comme des jokers', async () => {
    const { t, categoryId } = await tenant();
    const percent = await add(t, categoryId, { note: 'Remise 10% fidélité' });
    const underscore = await add(t, categoryId, { note: 'ref_42' });
    const backslash = await add(t, categoryId, { note: 'dossier C:\\factures' });
    const bang = await add(t, categoryId, { note: 'Promo a!b' });
    await add(t, categoryId, { note: 'Remise 100 euros ref-42 ab' });

    expect(ids(await list(t, { q: '0%' }).expect(200))).toEqual([percent]);
    expect(ids(await list(t, { q: 'f_4' }).expect(200))).toEqual([underscore]);
    expect(ids(await list(t, { q: ':\\f' }).expect(200))).toEqual([backslash]);
    expect(ids(await list(t, { q: 'a!b' }).expect(200))).toEqual([bang]);
  });

  it('filtre par montant min/max inclus, catégories et période, combinables', async () => {
    const { t } = await tenant();
    const [cat1, cat2] = await twoCategories(t);
    const cat3 = (await tenant()).categoryId; // catégorie d'un autre carnet : aucun résultat
    const small = await add(t, cat1, { amount: 500, date: '2026-03-31' });
    const low = await add(t, cat1, { amount: 1000, date: '2026-04-01' });
    const mid = await add(t, cat2, { amount: 2500, date: '2026-04-15' });
    const high = await add(t, cat2, { amount: 5000, date: '2026-04-30' });
    const later = await add(t, cat1, { amount: 2500, date: '2026-05-01' });

    const sorted = async (query: Record<string, string | number | string[]>) =>
      ids(await list(t, query).expect(200)).sort();

    expect(await sorted({ minAmount: 1000, maxAmount: 2500 })).toEqual([low, mid, later].sort());
    expect(await sorted({ minAmount: 5000 })).toEqual([high]);
    expect(await sorted({ maxAmount: 500 })).toEqual([small]);
    expect(await sorted({ from: '2026-04-01', to: '2026-04-30' })).toEqual([low, mid, high].sort());
    expect(await sorted({ from: '2026-05-01' })).toEqual([later]);
    expect(await sorted({ to: '2026-03-31' })).toEqual([small]);
    expect(await sorted({ categoryId: cat2 })).toEqual([mid, high].sort());
    expect(await sorted({ categoryId: [cat1, cat2] })).toHaveLength(5);
    expect(await sorted({ categoryId: cat3 })).toEqual([]);
    // Combinaison : catégorie 1, avril, ≥ 10 €.
    expect(
      await sorted({ categoryId: cat1, from: '2026-04-01', to: '2026-04-30', minAmount: 1000 }),
    ).toEqual([low]);
  });

  it('pagine par curseur sans doublon ni trou, y compris à date égale', async () => {
    const { t, categoryId } = await tenant();
    const created: string[] = [];
    for (const date of ['2026-04-01', '2026-04-02', '2026-04-02', '2026-04-02', '2026-04-03']) {
      created.push(await add(t, categoryId, { date, merchant: 'Marché' }));
    }
    await add(t, categoryId, { date: '2026-04-02', merchant: 'Autre' });
    // Ordre attendu : date décroissante puis id (UUID v7 croissant à la création) décroissant.
    const expected = [created[4], created[3], created[2], created[1], created[0]];

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: Record<string, string | number> = { q: 'marche', limit: 2 };
      if (cursor) query.cursor = cursor;
      const res = await list(t, query).expect(200);
      expect(page(res).items.length).toBeLessThanOrEqual(2);
      seen.push(...ids(res));
      cursor = page(res).nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);

    // Page pleine en fin de liste : pas de curseur vers une page vide.
    const exact = await list(t, { q: 'marche', limit: 5 }).expect(200);
    expect(ids(exact)).toEqual(expected);
    expect(page(exact).nextCursor).toBeNull();

    // Dépenses ajoutées entre deux pages : la suite reprend après la dernière ligne vue, sans
    // doublon ; une dépense classée avant le curseur (date plus récente, ou même date et id plus
    // grand) n'apparaît pas dans la suite, une dépense classée après y apparaît.
    const first = await list(t, { q: 'marche', limit: 2 }).expect(200);
    await add(t, categoryId, { date: '2026-04-04', merchant: 'Marché' });
    await add(t, categoryId, { date: '2026-04-02', merchant: 'Marché' });
    const older = await add(t, categoryId, { date: '2026-04-01', merchant: 'Marché' });
    const rest = await list(t, {
      q: 'marche',
      limit: 10,
      cursor: page(first).nextCursor!,
    }).expect(200);
    expect(ids(first)).toEqual(expected.slice(0, 2));
    expect(ids(rest)).toEqual([expected[2], expected[3], older, expected[4]]);
  });

  it('plafonne la page à 50 par défaut', async () => {
    const { t, categoryId } = await tenant();
    for (let i = 0; i < 51; i += 1) await add(t, categoryId, {});
    const res = await list(t).expect(200);
    expect(page(res).items).toHaveLength(50);
    expect(page(res).nextCursor).not.toBeNull();
    const rest = await list(t, { cursor: page(res).nextCursor! }).expect(200);
    expect(page(rest).items).toHaveLength(1);
    expect(page(rest).nextCursor).toBeNull();
  });

  it.each<[string, Record<string, string | number | string[]>]>([
    ['limite nulle', { limit: 0 }],
    ['limite > 100', { limit: 101 }],
    ['limite décimale', { limit: '1.5' }],
    ['montant décimal', { minAmount: '10.5' }],
    ['montant négatif', { maxAmount: -1 }],
    ['montant non numérique', { minAmount: 'abc' }],
    ['min > max', { minAmount: 2000, maxAmount: 1000 }],
    ['date impossible', { from: '2026-02-30' }],
    ['date au mauvais format', { to: '01/04/2026' }],
    ['début après fin', { from: '2026-04-02', to: '2026-04-01' }],
    ['catégorie non UUID', { categoryId: 'abc' }],
    ['curseur invalide', { cursor: 'pas-un-curseur' }],
    ['texte trop long', { q: 'x'.repeat(101) }],
    ['paramètre inconnu', { sort: 'amount' }],
    ['paramètre unique répété', { limit: ['1', '2'] }],
  ])('refuse une requête invalide (400) : %s', async (_label, query) => {
    const { t } = await tenant();
    const res = await list(t, query).expect(400);
    expect(page(res).detail).toMatch(/^Paramètres invalides : /);
  });
});
