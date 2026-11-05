// Purges et récurrences (ADR-026, ADR-032) : une récurrence supprimée depuis plus de 30 jours part
// avec ses échéances, avant les catégories ; une catégorie encore référencée par une récurrence
// reste ; `purgeNotebook` efface récurrences, échéances et dépenses liées. Plage : mars 2025 (la
// purge parcourt toute la base : aucune autre suite n'a de suppression antérieure à juin 2025).
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  category,
  expense,
  notebook,
  occurrence,
  recurringExpense,
} from '../../src/db/schema/index.js';
import { withTransaction } from '../../src/db/transaction.js';
import { newId } from '../../src/db/uuid.js';
import { purgeNotebook } from '../../src/notebooks/purge-notebook.js';
import { purgeDeletedSyncRows } from '../../src/sync/deleted-rows-purge.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

const MARCH = new Date(Date.UTC(2025, 2, 1));

describe('purges et récurrences', () => {
  const { pool, db } = testDb(2);

  afterAll(async () => {
    await pool.promise().end();
  });

  /** Carnet (compte sans connexion), catégorie personnalisée, récurrence et deux échéances. */
  async function setup(deletedAt: Date | null) {
    const { notebookId } = await createUser(db, MARCH);
    const categoryId = newId();
    await db.insert(category).values({
      id: categoryId,
      notebookId,
      name: `Purge ${categoryId}`,
      icon: '🧹',
      color: '#222222',
      position: 1000,
      createdAt: MARCH,
      updatedAt: MARCH,
      deletedAt,
    });
    const recurringId = newId();
    await db.insert(recurringExpense).values({
      id: recurringId,
      notebookId,
      name: 'Mutuelle',
      amount: 4_500,
      currency: 'EUR',
      amountKind: 'fixed',
      frequency: 'monthly',
      startDate: '2025-01-10',
      categoryId,
      mode: 'auto',
      generatedThrough: '2025-04-10',
      createdAt: MARCH,
      updatedAt: MARCH,
      deletedAt,
    });
    const expenseId = newId();
    await db.insert(expense).values({
      id: expenseId,
      notebookId,
      amount: 4_500,
      currency: 'EUR',
      categoryId,
      spentOn: '2025-02-10',
      source: 'recurrence',
      createdAt: MARCH,
      updatedAt: MARCH,
    });
    const occurrenceIds = [newId(), newId()];
    await db.insert(occurrence).values(
      [
        { dueDate: '2025-02-10', status: 'paid' as const, amount: 4_500, expenseId },
        { dueDate: '2025-03-10', status: 'pending' as const },
      ].map((o, i) => ({
        ...o,
        id: occurrenceIds[i]!,
        notebookId,
        recurringExpenseId: recurringId,
        createdAt: MARCH,
        updatedAt: MARCH,
        deletedAt,
      })),
    );
    return { notebookId, categoryId, recurringId, expenseId, occurrenceIds };
  }

  it('purge des suppressions : récurrence et échéances parties, catégorie gardée tant que référencée', async () => {
    const purged = await setup(MARCH);
    // Récurrence supprimée récemment : sa catégorie (supprimée depuis longtemps) reste.
    const recent = await setup(MARCH);
    await db
      .update(recurringExpense)
      .set({ deletedAt: new Date(Date.UTC(2025, 3, 1)) })
      .where(eq(recurringExpense.id, recent.recurringId));
    // Sans dépense : seule la récurrence retient encore la catégorie de `recent`.
    await db.delete(expense).where(inArray(expense.id, [purged.expenseId, recent.expenseId]));

    await purgeDeletedSyncRows().run(db, new Date(Date.UTC(2025, 3, 5))); // seuil : 6 mars 2025

    expect(await db.$count(recurringExpense, eq(recurringExpense.id, purged.recurringId))).toBe(0);
    expect(await db.$count(occurrence, inArray(occurrence.id, purged.occurrenceIds))).toBe(0);
    expect(await db.$count(category, eq(category.id, purged.categoryId))).toBe(0);
    expect(await db.$count(recurringExpense, eq(recurringExpense.id, recent.recurringId))).toBe(1);
    expect(await db.$count(occurrence, inArray(occurrence.id, recent.occurrenceIds))).toBe(2);
    expect(await db.$count(category, eq(category.id, recent.categoryId))).toBe(1);
  });

  it('purgeNotebook : récurrences, échéances et dépenses du carnet', async () => {
    const { notebookId, recurringId, expenseId } = await setup(null);
    await withTransaction(db, (tx) => purgeNotebook(tx, notebookId));
    expect(await db.$count(notebook, eq(notebook.id, notebookId))).toBe(0);
    expect(await db.$count(recurringExpense, eq(recurringExpense.id, recurringId))).toBe(0);
    expect(await db.$count(occurrence, eq(occurrence.notebookId, notebookId))).toBe(0);
    expect(await db.$count(expense, eq(expense.id, expenseId))).toBe(0);
  });
});
