// Limites de dépenses (§8.3 « SpendingLimit », F-LIM-01/02/05/09, ADR-027). Chaque ligne est une
// **version** : modifier la limite crée une version datée (date d'effet), l'historique est conservé
// pour que chaque période passée garde la limite de l'époque. `amount` NULL = « aucune limite ».
// Table synchronisée : suppression logique, index (notebook_id, updated_at, id).
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  index,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { category } from './category.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import { notebook } from './notebook.js';

export const LIMIT_PERIOD_KINDS = ['month', 'week'] as const;
export type LimitPeriodKind = (typeof LIMIT_PERIOD_KINDS)[number];

export const spendingLimit = mysqlTable(
  'spending_limit',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    /** NULL = limite globale (seule possible au MVP ; limites par catégorie : F-LIM-07, backlog). */
    categoryId: uuidBinary('category_id').references(() => category.id),
    /**
     * Clé d'unicité : la catégorie, ou 16 octets nuls pour la limite globale (un index unique
     * ignore les NULL). Colonne générée stockée, jamais écrite par l’application ; sans NOT NULL
     * (refusé par MariaDB sur une colonne générée), jamais NULL par construction.
     */
    categoryKey: uuidBinary('category_key').generatedAlwaysAs(
      sql`coalesce(\`category_id\`, 0x00000000000000000000000000000000)`,
      {
        mode: 'stored',
      },
    ),
    periodKind: varchar('period_kind', { length: 8 }).$type<LimitPeriodKind>().notNull(),
    /** Mois : jour 1–31 (repli fin de mois, ADR-012) ; semaine : jour ISO 1 = lundi … 7. */
    startDay: tinyint('start_day').notNull(),
    /** Unités mineures de `currency` ; NULL = aucune limite à partir de la date d'effet. */
    amount: bigint('amount', { mode: 'number' }),
    currency: char('currency', { length: 3 }).notNull(),
    includeRecurring: boolean('include_recurring').notNull().default(true),
    /** Date calendaire (fuseau du compte) à partir de laquelle la version s'applique. */
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('spending_limit_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    uniqueIndex('spending_limit_version_uq').on(t.notebookId, t.categoryKey, t.effectiveDate),
    index('spending_limit_category_idx').on(t.categoryId),
  ],
);
