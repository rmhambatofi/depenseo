// Exports de dépenses demandés (F-EXP-01, ADR-036) : une ligne par demande, le fichier chiffré
// vit sur le disque (`FILE_STORAGE_DIR/<id>.enc`), servi par l'API jusqu'à `expires_at`.
// Non synchronisée, mais porte les colonnes communes aux tables de carnet (invariants).
import { date, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import { notebook } from './notebook.js';
import { user } from './user.js';

export const EXPORT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const exportFile = mysqlTable(
  'export_file',
  {
    /** UUID v7 tiré par le client : la demande est rejouable sans doublon. */
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    /** Demandeur, seul autorisé à télécharger. */
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    format: varchar('format', { length: 8 }).$type<'csv' | 'xlsx'>().notNull(),
    /** Période demandée, bornes incluses (dates calendaires, NF-FMT-02). */
    dateFrom: date('date_from', { mode: 'string' }).notNull(),
    dateTo: date('date_to', { mode: 'string' }).notNull(),
    status: varchar('status', { length: 16 }).$type<ExportStatus>().notNull(),
    /** Fin de validité du lien de téléchargement (prêt + 15 min) ; NULL tant que non prêt. */
    expiresAt: utcDateTime('expires_at'),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('export_file_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    index('export_file_user_idx').on(t.userId),
    // Purge des exports expirés ou abandonnés (tâche périodique).
    index('export_file_purge_idx').on(t.status, t.expiresAt),
    index('export_file_created_idx').on(t.createdAt),
  ],
);
