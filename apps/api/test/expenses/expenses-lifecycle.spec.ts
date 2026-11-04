// Cycle de vie des dépenses (F-DEP-10, ADR-024) : suppression logique, restauration, rejeu d'une
// création supprimée, purge physique du carnet.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { category, expenseTag, notebook, tag } from '../../src/db/schema/index.js';
import { ER_ROW_IS_REFERENCED_2, hasErrno, withTransaction } from '../../src/db/transaction.js';
import { newId } from '../../src/db/uuid.js';
import { purgeNotebook } from '../../src/notebooks/purge-notebook.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { expenseClient, json } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

describe('cycle de vie des dépenses (F-DEP-10)', () => {
  const clock = new FakeClock(Date.UTC(2026, 3, 11, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const { create, getOne, patch, remove, restore, categories, tenant, rowsWithId } = expenseClient(
    () => app,
    db,
    clock,
  );

  it('suppression logique, idempotente, puis restauration (F-DEP-10)', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    const created = json(
      await create(t, { id, amount: 990, categoryId, date: '2026-04-10', tags: ['garde'] }),
    );
    clock.advance(1000);
    await remove(t, id).expect(204);
    const [row] = await rowsWithId(id);
    expect(row!.deletedAt).toEqual(clock.now());
    expect(row!.updatedAt).toEqual(clock.now());
    await getOne(t, id).expect(404);
    expect((await patch(t, id, { amount: 1 })).status).toBe(404);
    await remove(t, id).expect(204);
    // Rejeu de création d'une dépense supprimée : pas de résurrection silencieuse.
    expect((await create(t, { id, amount: 990, categoryId, date: '2026-04-10' })).status).toBe(409);

    clock.advance(1000);
    const restored = await restore(t, id);
    expect(restored.status).toBe(200);
    expect(json(restored)).toEqual({ ...created, updatedAt: clock.now().toISOString() });
    expect(json(await getOne(t, id).expect(200)).tags).toEqual(['garde']);
    // Restaurer une dépense active : sans effet.
    expect((await restore(t, id)).status).toBe(200);
    await restore(t, newId()).expect(404);
    await remove(t, newId()).expect(404);
  });

  it('rejeu d’une création supprimée : 409 distinct de « identifiant pris ailleurs »', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    await create(t, { id, amount: 5, categoryId, date: '2026-04-12' }).expect(201);
    await remove(t, id).expect(204);
    const res = await create(t, { id, amount: 5, categoryId, date: '2026-04-12' });
    expect(res.status).toBe(409);
    expect(json(res).detail).toContain('restaurer');
  });

  it('restauration d’une dépense dont la catégorie a été supprimée : 200, catégorie conservée', async () => {
    const { t } = await tenant();
    const custom = newId();
    await categories(t, 'post', '', {
      id: custom,
      name: 'Provisoire',
      icon: '🧪',
      color: '#00AA00',
    }).expect(201);
    const id = newId();
    await create(t, { id, amount: 50, categoryId: custom, date: '2026-04-13' }).expect(201);
    await remove(t, id).expect(204);
    await categories(t, 'delete', `/${custom}`).expect(204);
    const restored = await restore(t, id);
    expect(restored.status).toBe(200);
    expect(json(restored).categoryId).toBe(custom);
  });

  it('purge du carnet : dépenses et étiquettes suivent ; catégorie référencée non purgeable', async () => {
    const { t, categoryId } = await tenant();
    const id = newId();
    await create(t, { id, amount: 80, categoryId, date: '2026-04-15', tags: ['p'] }).expect(201);
    // Une purge de catégorie ne doit jamais effacer une dépense en silence (ADR-024).
    const purge = await db
      .delete(category)
      .where(eq(category.id, categoryId))
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(hasErrno(purge, ER_ROW_IS_REFERENCED_2)).toBe(true);
    // Suppression directe du carnet refusée (pas de cascade vers les dépenses par la catégorie)…
    const direct = await db
      .delete(notebook)
      .where(eq(notebook.id, t.notebookId))
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(hasErrno(direct, ER_ROW_IS_REFERENCED_2)).toBe(true);
    // … d'où `purgeNotebook`, à utiliser par la suppression du compte (P4-06).
    await withTransaction(db, (tx) => purgeNotebook(tx, t.notebookId));
    expect(await db.select().from(notebook).where(eq(notebook.id, t.notebookId))).toHaveLength(0);
    expect(await rowsWithId(id)).toHaveLength(0);
    expect(await db.select().from(tag).where(eq(tag.notebookId, t.notebookId))).toHaveLength(0);
    expect(await db.select().from(expenseTag).where(eq(expenseTag.expenseId, id))).toHaveLength(0);
  });
});
