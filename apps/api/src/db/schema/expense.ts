// Dépenses, étiquettes et liaison (§8.3 « Expense », F-DEP-03, NF-FMT-01/02, ADR-024).
// `expense` et `tag` sont synchronisées (suppression logique, index (notebook_id, updated_at, id)) ;
// `expense_tag` ne porte pas `notebook_id` : elle voyage avec sa dépense, dont `updated_at` avance
// à chaque changement d'étiquettes. FK vers `category` et `tag` sans cascade : une purge ne doit
// jamais effacer une dépense ni une liaison en silence (ADR-024).
import {
  bigint,
  char,
  date,
  index,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { category } from './category.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import { notebook } from './notebook.js';

export const EXPENSE_SOURCES = ['manual', 'recurrence'] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export const expense = mysqlTable(
  'expense',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    /** Centimes (unité mineure de `currency`), entier strictement positif (NF-FMT-01). */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** Catégorie du même carnet (contrôle applicatif) ; une catégorie masquée reste valide. */
    categoryId: uuidBinary('category_id')
      .notNull()
      .references(() => category.id),
    /** Date calendaire AAAA-MM-JJ, sans heure ni fuseau (NF-FMT-02). */
    spentOn: date('spent_on', { mode: 'string' }).notNull(),
    note: varchar('note', { length: 500 }),
    merchant: varchar('merchant', { length: 100 }),
    source: varchar('source', { length: 16 }).$type<ExpenseSource>().notNull().default('manual'),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('expense_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    index('expense_date_idx').on(t.notebookId, t.spentOn, t.id),
    index('expense_category_idx').on(t.categoryId),
  ],
);

/** Étiquette du carnet, identifiée par son nom (unicité sous utf8mb4_unicode_520_ci). */
export const tag = mysqlTable(
  'tag',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('tag_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    uniqueIndex('tag_name_uq').on(t.notebookId, t.name),
  ],
);

export const expenseTag = mysqlTable(
  'expense_tag',
  {
    id: primaryId(),
    expenseId: uuidBinary('expense_id')
      .notNull()
      .references(() => expense.id, { onDelete: 'cascade' }),
    tagId: uuidBinary('tag_id')
      .notNull()
      .references(() => tag.id),
  },
  (t) => [
    uniqueIndex('expense_tag_uq').on(t.expenseId, t.tagId),
    index('expense_tag_tag_idx').on(t.tagId),
  ],
);
