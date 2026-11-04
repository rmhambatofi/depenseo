// Synchronisation différentielle (NF-OFF-01, §8.2, ADR-026) : flux catégories → étiquettes →
// dépenses trié par (updated_at, id), suppressions incluses, curseur stable sur un horodatage
// partagé, filigrane fixé au premier appel, 410 au-delà de la rétention.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/db/uuid.js';
import type { Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { auth, type ExpenseBody, expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

interface Row {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}
interface SyncPage {
  categories: (Row & { name: string; parentId: string | null; position: number })[];
  tags: (Row & { name: string })[];
  expenses: (Row & ExpenseBody)[];
  nextCursor: string | null;
  nextUpdatedSince: string;
  detail?: string;
}
const page = (res: { body: unknown }) => res.body as SyncPage;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('synchronisation différentielle (NF-OFF-01)', () => {
  const clock = new FakeClock(Date.UTC(2026, 6, 1, 8, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const { create, remove, restore, patch, categories, tenant } = expenseClient(
    () => app,
    db,
    clock,
  );

  const sync = (t: Tenant, query: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]),
    ).toString();
    const path = `/api/v1/notebooks/${t.notebookId}/sync`;
    return request(http(app))
      .get(qs ? `${path}?${qs}` : path)
      .set(auth(t));
  };

  /** Parcourt toutes les pages ; renvoie les pages reçues. */
  const walk = async (t: Tenant, query: Record<string, string | number>) => {
    const pages: SyncPage[] = [];
    let res = await sync(t, query).expect(200);
    pages.push(page(res));
    while (page(res).nextCursor) {
      const rest = Object.fromEntries(Object.entries(query).filter(([k]) => k !== 'updated_since'));
      res = await sync(t, { ...rest, cursor: page(res).nextCursor! }).expect(200);
      pages.push(page(res));
      expect(pages.length).toBeLessThan(500);
    }
    return pages;
  };
  const ids = (pages: SyncPage[], table: 'categories' | 'tags' | 'expenses') =>
    pages.flatMap((p) => p[table].map((r) => r.id));

  const addExpense = async (t: Tenant, categoryId: string, fields: object = {}) => {
    const id = newId();
    await create(t, { id, amount: 1234, categoryId, date: '2026-06-30', ...fields }).expect(201);
    return id;
  };

  it('synchronisation complète : plan de catégories, étiquettes, dépenses avec leurs étiquettes', async () => {
    clock.advance(MINUTE);
    const { t, categoryId } = await tenant();
    const id = await addExpense(t, categoryId, { tags: ['Vacances'], note: 'Café' });

    const res = await sync(t).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = page(res);
    expect(body.nextCursor).toBeNull();
    expect(body.categories.length).toBe(64);
    expect(body.categories.every((c) => c.deletedAt === null)).toBe(true);
    expect(body.tags).toEqual([
      {
        id: expect.any(String) as unknown,
        name: 'Vacances',
        updatedAt: expect.any(String) as unknown,
        deletedAt: null,
      },
    ]);
    expect(body.expenses).toEqual([
      expect.objectContaining({
        id,
        amount: 1234,
        tags: ['Vacances'],
        note: 'Café',
        deletedAt: null,
      }),
    ]);
    // Filigrane : horloge serveur moins 5 minutes.
    expect(body.nextUpdatedSince).toBe(new Date(clock.now().getTime() - 5 * MINUTE).toISOString());
  });

  it('trois lignes au même updated_at : chacune servie une seule fois, quel que soit le découpage', async () => {
    clock.advance(MINUTE);
    const { t, categoryId } = await tenant();
    clock.advance(MINUTE);
    const since = clock.now().toISOString();
    const same = [
      await addExpense(t, categoryId),
      await addExpense(t, categoryId),
      await addExpense(t, categoryId),
    ];
    const sorted = [...same].sort();
    for (const limit of [1, 2, 3, 4]) {
      const pages = await walk(t, { updated_since: since, limit });
      expect(ids(pages, 'expenses'), `limit=${limit}`).toEqual(sorted);
      expect(pages.every((p) => p.nextUpdatedSince === pages[0]!.nextUpdatedSince)).toBe(true);
      expect(
        pages.every((p) => p.categories.length + p.tags.length + p.expenses.length <= limit),
      ).toBe(true);
    }
    // Les trois partagent bien le même horodatage.
    const [first] = await walk(t, { updated_since: since });
    expect(new Set(first!.expenses.map((e) => e.updatedAt)).size).toBe(1);
  });

  it('le parcours paginé traverse les trois tables sans doublon ni oubli', async () => {
    clock.advance(MINUTE);
    const { t, categoryId } = await tenant();
    const e1 = await addExpense(t, categoryId, { tags: ['a', 'b'] });
    const full = page(await sync(t).expect(200));
    // 7 : fin de table au milieu d'une page ; 8 et 64 : fin de table pile en fin de page ;
    // 66 : fin de parcours pile en fin de page (64 catégories + 2 étiquettes + 1 dépense = 67).
    for (const limit of [7, 8, 64, 66, 67]) {
      const pages = await walk(t, { limit });
      expect(ids(pages, 'categories'), `limit=${limit}`).toEqual(full.categories.map((c) => c.id));
      expect(new Set(ids(pages, 'categories')).size).toBe(64);
      expect(ids(pages, 'tags'), `limit=${limit}`).toEqual(full.tags.map((c) => c.id));
      expect(ids(pages, 'expenses'), `limit=${limit}`).toEqual([e1]);
      expect(
        pages.at(-1)!.categories.length + pages.at(-1)!.tags.length,
        `limit=${limit}`,
      ).toBeLessThanOrEqual(limit);
      expect(pages.slice(0, -1).every((p) => p.nextCursor !== null)).toBe(true);
    }
    // Ordre (updated_at, id) croissant dans chaque table.
    const keys = full.categories.map((c) => `${c.updatedAt}|${c.id}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('updated_since inclusif ; suppression puis restauration servies avec deletedAt', async () => {
    clock.advance(MINUTE);
    const { t, categoryId } = await tenant();
    const kept = await addExpense(t, categoryId);
    const gone = await addExpense(t, categoryId);
    clock.advance(MINUTE);
    const since = clock.now().toISOString();
    await remove(t, gone).expect(204);

    let body = page(await sync(t, { updated_since: since }).expect(200));
    expect(body.categories).toEqual([]);
    expect(body.expenses.map((e) => [e.id, e.deletedAt])).toEqual([[gone, since]]);
    expect(body.expenses.map((e) => e.id)).not.toContain(kept);

    clock.advance(MINUTE);
    const later = clock.now().toISOString();
    await restore(t, gone).expect(200);
    body = page(await sync(t, { updated_since: later }).expect(200));
    expect(body.expenses.map((e) => [e.id, e.deletedAt, e.updatedAt])).toEqual([
      [gone, null, later],
    ]);
  });

  it('catégorie supprimée ou masquée : servie avec son état', async () => {
    clock.advance(MINUTE);
    const { t, categoryId } = await tenant();
    clock.advance(MINUTE);
    const since = clock.now().toISOString();
    const custom = newId();
    await create(t, { id: newId(), amount: 1, categoryId, date: '2026-06-30' }).expect(201);
    await categories(t, 'post', '', {
      id: custom,
      name: 'Perso',
      icon: '🧪',
      color: '#112233',
    }).expect(201);
    clock.advance(MINUTE);
    await categories(t, 'delete', `/${custom}`).expect(204);
    await categories(t, 'patch', `/${categoryId}`, { hidden: true }).expect(200);

    const body = page(await sync(t, { updated_since: since }).expect(200));
    const byId = new Map(body.categories.map((c) => [c.id, c]));
    expect(byId.get(custom)?.deletedAt).toBe(clock.now().toISOString());
    expect(byId.get(categoryId)).toMatchObject({ hidden: true, deletedAt: null });
  });

  it('une modification faite pendant un parcours est servie au parcours suivant (filigrane)', async () => {
    clock.advance(MINUTE);
    const { t, categoryId } = await tenant();
    const id = await addExpense(t, categoryId);
    const first = page(await sync(t, { limit: 10 }).expect(200));
    expect(first.nextCursor).not.toBeNull();
    // Les catégories sont déjà passées ; on en modifie une, puis on finit le parcours.
    clock.advance(MINUTE);
    await patch(t, id, { amount: 99 }).expect(200);
    await categories(t, 'patch', `/${categoryId}`, { hidden: true }).expect(200);
    let cursor = first.nextCursor;
    while (cursor) {
      const p = page(await sync(t, { cursor }).expect(200));
      expect(p.nextUpdatedSince).toBe(first.nextUpdatedSince);
      cursor = p.nextCursor;
    }
    const next = page(await sync(t, { updated_since: first.nextUpdatedSince }).expect(200));
    expect(next.categories.map((c) => c.id)).toContain(categoryId);
    expect(next.expenses.find((e) => e.id === id)?.amount).toBe(99);
  });

  it('ne sert que les lignes du carnet demandé', async () => {
    clock.advance(MINUTE);
    const a = await tenant();
    const b = await tenant();
    const mine = await addExpense(a.t, a.categoryId);
    await addExpense(b.t, b.categoryId);
    const body = page(await sync(a.t).expect(200));
    expect(body.expenses.map((e) => e.id)).toEqual([mine]);
    expect(body.categories.map((c) => c.id)).toContain(a.categoryId);
    expect(body.categories.map((c) => c.id)).not.toContain(b.categoryId);
  });

  it('paramètres invalides → 400 ; updated_since au-delà de 29 jours → 410', async () => {
    clock.advance(MINUTE);
    const { t } = await tenant();
    const { nextCursor } = page(await sync(t, { limit: 1 }).expect(200));
    const now = clock.now().getTime();
    const invalid: Record<string, string | number>[] = [
      { updated_since: '2026-07-01' },
      { updated_since: '2026-07-01T08:00:00+02:00' },
      { updated_since: '2026-02-30T08:00:00Z' },
      { updated_since: new Date(now).toISOString(), cursor: nextCursor! },
      { cursor: 'nimporte-quoi' },
      { cursor: Buffer.from('v1~9~~~~1').toString('base64url') },
      { limit: 0 },
      { limit: 501 },
      { limit: '1e2' },
      { foo: 'bar' },
    ];
    for (const query of invalid) {
      const res = await sync(t, query).expect(400);
      expect(page(res).detail, JSON.stringify(query)).toMatch(/^Paramètres invalides/);
    }
    await sync(t, { limit: 500 }).expect(200);
    await sync(t, { updated_since: new Date(now - 29 * DAY).toISOString() }).expect(200);
    const res = await sync(t, { updated_since: new Date(now - 29 * DAY - 1).toISOString() }).expect(
      410,
    );
    expect(page(res).detail).toMatch(/synchronisation complète/);
  });
});
