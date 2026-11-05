// Lignes d'un export (F-EXP-01, ADR-036) : dépenses actives du carnet dont la date calendaire est
// dans la période (bornes incluses), par date puis identifiant croissants. Catégorie racine et
// sous-catégorie résolues par jointure ; une catégorie masquée ou supprimée garde son nom.
import { and, asc, between, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { Database } from '../db/connection.js';
import { category, expense } from '../db/schema/index.js';
import { tagNamesByExpense } from '../expenses/expense-tags.js';
import type { ExportRow } from './export-format.js';

const TAG_BATCH = 1_000;

export async function loadExportRows(
  db: Database,
  notebookId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ExportRow[]> {
  const parent = alias(category, 'parent_category');
  const rows = await db
    .select({
      id: expense.id,
      date: expense.spentOn,
      amount: expense.amount,
      currency: expense.currency,
      categoryName: category.name,
      parentName: parent.name,
      merchant: expense.merchant,
      note: expense.note,
      source: expense.source,
    })
    .from(expense)
    .innerJoin(category, eq(category.id, expense.categoryId))
    .leftJoin(parent, eq(parent.id, category.parentId))
    .where(
      and(
        eq(expense.notebookId, notebookId),
        isNull(expense.deletedAt),
        between(expense.spentOn, dateFrom, dateTo),
      ),
    )
    .orderBy(asc(expense.spentOn), asc(expense.id));
  const tags = new Map<string, string[]>();
  for (let i = 0; i < rows.length; i += TAG_BATCH) {
    const batch = rows.slice(i, i + TAG_BATCH).map((r) => r.id);
    for (const [id, names] of await tagNamesByExpense(db, batch)) tags.set(id, names);
  }
  return rows.map((r) => ({
    date: r.date,
    amount: r.amount,
    currency: r.currency,
    category: r.parentName ?? r.categoryName,
    subcategory: r.parentName === null ? null : r.categoryName,
    merchant: r.merchant,
    note: r.note,
    tags: tags.get(r.id) ?? [],
    source: r.source,
  }));
}
