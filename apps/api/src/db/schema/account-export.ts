// Exports RGPD des données du compte (F-AUTH-08, ADR-038) : une ligne par demande, l'archive zip
// chiffrée vit sur le disque (`FILE_STORAGE_DIR/<id>.enc`), servie par l'API jusqu'à `expires_at`.
// Table de compte, non synchronisée (pas de `notebook_id`).
import { index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, timestamps, utcDateTime } from './columns.js';
import type { ExportStatus } from './export-file.js';
import { user } from './user.js';

export const accountExport = mysqlTable(
  'account_export',
  {
    /** UUID v7 tiré par le client : la demande est rejouable sans doublon. */
    id: primaryId(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16 }).$type<ExportStatus>().notNull(),
    /** Fin de validité du lien de téléchargement (prêt + 15 min) ; NULL tant que non prêt. */
    expiresAt: utcDateTime('expires_at'),
    ...timestamps(),
  },
  (t) => [
    index('account_export_user_idx').on(t.userId),
    index('account_export_purge_idx').on(t.status, t.expiresAt),
    index('account_export_created_idx').on(t.createdAt),
  ],
);
