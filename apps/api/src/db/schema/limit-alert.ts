// Alertes de limite déjà émises (F-LIM-04, ADR-004, ADR-029) : le seuil le plus haut notifié par
// carnet et par période. Mémoire durable de l'idempotence : les tâches `notify` terminées sont
// purgées après 7 jours, bien avant la fin d'une période mensuelle. Non synchronisée, mais porte
// les colonnes communes aux tables de carnet (updated_at, deleted_at, index de synchronisation).
import { date, index, mysqlTable, smallint, uniqueIndex } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import { notebook } from './notebook.js';

export const limitAlert = mysqlTable(
  'limit_alert',
  {
    id: primaryId(),
    notebookId: uuidBinary('notebook_id')
      .notNull()
      .references(() => notebook.id, { onDelete: 'cascade' }),
    /** Premier jour de la période (éventuellement tronquée, ADR-027). */
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    /** Seuil le plus haut déjà notifié, en pourcentage de la limite (80, 100, 110…). */
    threshold: smallint('threshold', { unsigned: true }).notNull(),
    ...timestamps(),
    deletedAt: utcDateTime('deleted_at'),
  },
  (t) => [
    index('limit_alert_sync_idx').on(t.notebookId, t.updatedAt, t.id),
    uniqueIndex('limit_alert_period_uq').on(t.notebookId, t.periodStart),
  ],
);
