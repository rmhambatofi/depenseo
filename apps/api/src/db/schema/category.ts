// Catégories (§8.3 « Category », F-CAT-01/02, ADR-023) : deux niveaux (racine, sous-catégorie),
// plan par défaut copié dans chaque carnet (`system_key` non nul) et catégories personnalisées.
// Table synchronisée : suppression logique, index (notebook_id, updated_at, id).
import {
  type AnyMySqlColumn,
  boolean,
  char,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import { notebook } from './notebook.js';

export const category = mysqlTable(
  'category',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    /** Racine si NULL ; une sous-catégorie n'a jamais d'enfant (deux niveaux). */
    parentId: uuidBinary('parent_id').references((): AnyMySqlColumn => category.id, {
      onDelete: 'cascade',
    }),
    /** Clé stable du plan par défaut (`housing.rent`), NULL pour une catégorie personnalisée. */
    systemKey: varchar('system_key', { length: 64 }),
    name: varchar('name', { length: 100 }).notNull(),
    /** Emoji (ou court nom d'icône), utf8mb4 : stocké sans perte. */
    icon: varchar('icon', { length: 32 }).notNull(),
    /** `#RRGGBB`. */
    color: char('color', { length: 7 }).notNull(),
    /** Ordre d'affichage parmi les sœurs (plan par défaut 0…n, personnalisées 1000). */
    position: int('position').notNull().default(0),
    hidden: boolean('hidden').notNull().default(false),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('category_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    index('category_parent_idx').on(t.parentId),
    uniqueIndex('category_system_key_uq').on(t.notebookId, t.systemKey),
  ],
);

export const CUSTOM_CATEGORY_POSITION = 1000;
