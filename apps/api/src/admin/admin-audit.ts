// Journal d'audit des accès administrateurs (NF-SEC-06, ADR-042) : identifiants et route seulement,
// jamais de montant, d'adresse e-mail ni de paramètre de requête.
import type { Database } from '../db/connection.js';
import { auditLog } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';

export type AdminAuditAction =
  | 'admin.grant'
  | 'admin.revoke'
  | 'admin.login'
  | 'admin.login_failed'
  | 'admin.login_blocked'
  | 'admin.access';

export interface AdminAuditEntry {
  actorUserId: string | null;
  action: AdminAuditAction;
  route?: string;
  targetType?: string;
  targetId?: string;
}

export async function recordAdminAudit(
  db: Pick<Database, 'insert'>,
  entry: AdminAuditEntry,
  now: Date,
): Promise<void> {
  await db.insert(auditLog).values({
    id: newId(),
    actorUserId: entry.actorUserId,
    action: entry.action,
    route: entry.route ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    createdAt: now,
  });
}
