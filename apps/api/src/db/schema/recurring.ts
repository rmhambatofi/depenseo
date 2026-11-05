// Dépenses récurrentes et échéances (§8.3 « RecurringExpense / Occurrence », F-REC-01/03, ADR-032).
// Deux tables synchronisées (suppression logique, index (notebook_id, updated_at, id)). Les
// échéances sont matérialisées jusqu'à un horizon glissant (`generated_through`) : chacune porte
// son statut et, une fois payée, la dépense créée.
import {
  bigint,
  boolean,
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
import { expense } from './expense.js';
import { notebook } from './notebook.js';

export const RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly', 'once'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export const AMOUNT_KINDS = ['fixed', 'estimated'] as const;
export type AmountKind = (typeof AMOUNT_KINDS)[number];
/** `auto` : dépense enregistrée à l'échéance ; `confirm` : demande de confirmation (F-REC-02). */
export const RECURRENCE_MODES = ['auto', 'confirm'] as const;
export type RecurrenceMode = (typeof RECURRENCE_MODES)[number];
export const OCCURRENCE_STATUSES = ['pending', 'paid', 'skipped'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const recurringExpense = mysqlTable(
  'recurring_expense',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** Unités mineures de `currency` ; montant prévu (fixe) ou estimé. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** Montant fixe ou estimé (colonne hors de la règle `*amount*` = BIGINT du test d'invariants). */
    amountKind: varchar('pricing', { length: 9 }).$type<AmountKind>().notNull(),
    frequency: varchar('frequency', { length: 9 }).$type<RecurrenceFrequency>().notNull(),
    /** Première échéance ; porte le jour de la récurrence (ADR-032). Immuable. */
    startDate: date('start_date', { mode: 'string' }).notNull(),
    categoryId: uuidBinary('category_id')
      .notNull()
      .references(() => category.id),
    mode: varchar('mode', { length: 7 }).$type<RecurrenceMode>().notNull(),
    /** Rappels à l'heure de rappel du propriétaire (F-REC-04, ADR-034). */
    remindThreeDaysBefore: boolean('remind_three_days_before').notNull().default(true),
    remindOnDueDate: boolean('remind_on_due_date').notNull().default(true),
    /** Échéances matérialisées jusqu'à cette date incluse (interne, non exposé). */
    generatedThrough: date('generated_through', { mode: 'string' }).notNull(),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('recurring_expense_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    index('recurring_expense_category_idx').on(t.categoryId),
    index('recurring_expense_horizon_idx').on(t.generatedThrough),
  ],
);

export const occurrence = mysqlTable(
  'occurrence',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    recurringExpenseId: uuidBinary('recurring_expense_id')
      .notNull()
      .references(() => recurringExpense.id, { onDelete: 'cascade' }),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    status: varchar('status', { length: 7 }).$type<OccurrenceStatus>().notNull(),
    /**
     * Montant ajusté (unités mineures de la devise de la récurrence) ; NULL = montant de la
     * récurrence. Une fois payée : montant de la dépense créée.
     */
    amount: bigint('amount', { mode: 'number' }),
    /** Dépense créée au paiement ; mise à NULL si la purge (ADR-026) l'efface. */
    expenseId: uuidBinary('expense_id').references(() => expense.id, { onDelete: 'set null' }),
    /** Mode confirmation : échéance due signalée « à confirmer » (tâche périodique, F-REC-02). */
    confirmationRequestedAt: utcDateTime('confirmation_requested_at'),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('occurrence_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    uniqueIndex('occurrence_due_uq').on(t.recurringExpenseId, t.dueDate),
    index('occurrence_upcoming_idx').on(t.notebookId, t.status, t.dueDate),
    index('occurrence_expense_idx').on(t.expenseId),
    index('occurrence_due_idx').on(t.status, t.confirmationRequestedAt, t.dueDate),
    /** Rappels J-3 / jour J (ADR-034) : échéances en attente dans une plage de dates. */
    index('occurrence_reminder_idx').on(t.status, t.dueDate),
  ],
);
