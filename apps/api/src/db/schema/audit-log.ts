// Journal d'audit des accès administrateurs (NF-SEC-06, F-ADM-01).
// Ni montant ni donnée personnelle : identifiants et action seulement. Pas de clé étrangère :
// la trace survit à la suppression du compte visé ou de l'acteur.
import { index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';
import { primaryId, utcDateTime } from './columns.js';

export const auditLog = mysqlTable(
  'audit_log',
  {
    id: primaryId(),
    actorUserId: uuidBinary('actor_user_id'),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }),
    targetId: uuidBinary('target_id'),
    /** Route appelée (`GET /admin/api/session`) : motif Express, sans paramètre ni requête. */
    route: varchar('route', { length: 160 }),
    createdAt: utcDateTime('created_at').notNull(),
  },
  (t) => [
    index('audit_log_created_idx').on(t.createdAt),
    index('audit_log_actor_idx').on(t.actorUserId, t.createdAt),
  ],
);
