// Purge des suppressions logiques de plus de 30 jours (§8.2, ADR-026) : dépenses, puis étiquettes et
// catégories non référencées. Horloge en août 2025 : la purge est globale, sa date limite reste
// avant toute ligne supprimée par les autres suites (2026) ; et les jetons de rafraîchissement des
// connexions (échéance + 30 j) restent après la date de purge de `tokens.spec.ts` (2025-06-01).
import type { INestApplication } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { category, expense, expenseTag, tag } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { scheduledTasks } from '../../src/jobs/registry.js';
import { purgeDeletedSyncRows, SYNC_RETENTION_MS } from '../../src/sync/deleted-rows-purge.js';
import type { Tenant } from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

const DAY = 24 * 3_600_000;

describe('purge des suppressions de plus de 30 jours', () => {
  const clock = new FakeClock(Date.UTC(2025, 7, 1, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const { create, remove, categories, tenant } = expenseClient(() => app, db, clock);

  const addExpense = async (t: Tenant, categoryId: string, tags: string[] = []) => {
    const id = newId();
    await create(t, { id, amount: 500, categoryId, date: '2025-08-01', tags }).expect(201);
    return id;
  };
  const addCategory = async (t: Tenant, parentId: string | null = null) => {
    const id = newId();
    await categories(t, 'post', '', {
      id,
      name: `C${id.slice(-6)}`,
      icon: '🧪',
      color: '#123456',
      parentId,
    }).expect(201);
    return id;
  };
  const tagId = async (t: Tenant, name: string) => {
    const rows = await db
      .select({ id: tag.id, notebookId: tag.notebookId, name: tag.name })
      .from(tag);
    return rows.find((r) => r.notebookId === t.notebookId && r.name === name)!.id;
  };
  const existing = async (table: typeof expense | typeof category | typeof tag, ids: string[]) =>
    (await db.select({ id: table.id }).from(table).where(inArray(table.id, ids)))
      .map((r) => r.id)
      .sort();

  it('est déclarée parmi les tâches périodiques du cron', () => {
    expect(scheduledTasks().map((t) => t.name)).toContain('purge-deleted-sync-rows');
  });

  it('purge dépenses, étiquettes et catégories expirées non référencées ; garde le reste', async () => {
    const { t, categoryId } = await tenant();
    // Expiré : dépense supprimée, catégorie personnalisée supprimée dont la seule dépense l'est aussi,
    // parent et enfant supprimés, étiquette supprimée non liée (liée à une dépense purgée).
    const custom = await addCategory(t);
    const parent = await addCategory(t);
    const child = await addCategory(t, parent);
    const goneExpense = await addExpense(t, categoryId, ['vieux']);
    const onCustom = await addExpense(t, custom);
    // Gardé : catégorie supprimée référencée par une dépense active, étiquette supprimée liée à une
    // dépense active.
    const referenced = await addCategory(t);
    const alive = await addExpense(t, referenced, ['vivant']);
    await remove(t, goneExpense).expect(204);
    await remove(t, onCustom).expect(204);
    await categories(t, 'delete', `/${custom}`).expect(204);
    await categories(t, 'delete', `/${child}`).expect(204);
    await categories(t, 'delete', `/${parent}`).expect(204);
    await categories(t, 'delete', `/${referenced}`).expect(204);
    const oldTag = await tagId(t, 'vieux');
    const liveTag = await tagId(t, 'vivant');
    await db
      .update(tag)
      .set({ deletedAt: clock.now() })
      .where(inArray(tag.id, [oldTag, liveTag]));
    const deletedAt = clock.now().getTime();

    // Supprimée exactement à la date limite : gardée (strictement plus de 30 jours).
    const recent = await addExpense(t, categoryId);
    const recentAt = new Date(deletedAt + DAY);
    await db.update(expense).set({ deletedAt: recentAt }).where(eq(expense.id, recent));

    const now = new Date(recentAt.getTime() + SYNC_RETENTION_MS);
    expect(now.getTime() - SYNC_RETENTION_MS).toBeGreaterThan(deletedAt);
    // Lots d'une ligne : les boucles doivent aller au bout, enfant puis parent compris.
    const purged = await purgeDeletedSyncRows(1).run(db, now);
    expect(purged).toBeGreaterThanOrEqual(6);

    expect(await existing(expense, [goneExpense, onCustom, alive, recent])).toEqual(
      [alive, recent].sort(),
    );
    expect(await existing(category, [custom, parent, child, referenced, categoryId])).toEqual(
      [referenced, categoryId].sort(),
    );
    expect(await existing(tag, [oldTag, liveTag])).toEqual([liveTag]);
    expect(await db.select().from(expenseTag).where(eq(expenseTag.expenseId, goneExpense))).toEqual(
      [],
    );
    // Deuxième passage : plus rien à purger pour ce carnet, sans erreur.
    expect(await existing(expense, [recent])).toEqual([recent]);
    await purgeDeletedSyncRows().run(db, now);
    expect(await existing(expense, [recent])).toEqual([recent]);
  });

  it('ne purge jamais une catégorie supprimée dont une sous-catégorie est encore référencée', async () => {
    clock.advance(DAY);
    const { t } = await tenant();
    const parent = await addCategory(t);
    const child = await addCategory(t, parent);
    const onChild = await addExpense(t, child);
    await remove(t, onChild).expect(204);
    await categories(t, 'delete', `/${child}`).expect(204);
    await categories(t, 'delete', `/${parent}`).expect(204);
    // Dépense restaurée côté base après coup : la sous-catégorie reste référencée.
    await db.update(expense).set({ deletedAt: null }).where(eq(expense.id, onChild));

    await purgeDeletedSyncRows(1).run(db, new Date(clock.now().getTime() + SYNC_RETENTION_MS + 1));
    expect(await existing(category, [parent, child])).toEqual([parent, child].sort());
    expect(await existing(expense, [onChild])).toEqual([onChild]);
  });
});
