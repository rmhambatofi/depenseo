// Carnets et membres (§8.3, F-PAR-01/05). Toute table portant `notebook_id` est synchronisée.
import { index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import { user } from './user.js';

export const NOTEBOOK_KINDS = ['personal', 'shared'] as const;
export type NotebookKind = (typeof NOTEBOOK_KINDS)[number];
export const MEMBER_ROLES = ['owner', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const notebook = mysqlTable(
  'notebook',
  {
    id: primaryId(),
    name: varchar('name', { length: 100 }).notNull(),
    kind: varchar('kind', { length: 16 }).$type<NotebookKind>().notNull().default('personal'),
    ownerId: uuidBinary('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [index('notebook_owner_idx').on(t.ownerId)],
);

export const notebookMember = mysqlTable(
  'notebook_member',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).$type<MemberRole>().notNull(),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    uniqueIndex('notebook_member_uq').on(t.notebookId, t.userId),
    index('notebook_member_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    index('notebook_member_user_idx').on(t.userId),
  ],
);
