// Connexion au back-office (F-ADM-01, ADR-042) : e-mail + mot de passe + code TOTP. Tout refus,
// quelle qu'en soit la cause, est un 404 identique à une route inexistante (F-ADM-03) : un compte
// non administrateur n'apprend rien. Les échecs d'un administrateur sont audités et limités.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, gte, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { auditLog, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { ProblemException } from '../errors/problem.exception.js';
import { recordAdminAudit } from './admin-audit.js';
import { enrollmentOf } from './admin-session-token.js';
import { ADMIN_SETTINGS, type AdminSettings } from './admin-settings.js';
import { openSecret } from './secret-box.js';
import { verifyTotp } from './totp.js';

/** Au-delà de 5 codes refusés en 15 min, le compte admin est bloqué jusqu'à expiration. */
export const ADMIN_MAX_FAILURES = 5;
export const ADMIN_FAILURE_WINDOW_MS = 15 * 60_000;

export const adminLoginSchema = z.strictObject({
  email: z.string().max(254),
  password: z.string().max(PASSWORD_MAX_LENGTH),
  code: z.string().max(6),
});

type Outcome = { ok: true; userId: string; enrollment: string } | { ok: false };

@Injectable()
export class AdminLoginService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ADMIN_SETTINGS) private readonly settings: AdminSettings | null,
    private readonly auth: AuthService,
  ) {}

  async login(body: unknown): Promise<{ token: string; expiresAt: Date }> {
    const settings = this.settings;
    const parsed = adminLoginSchema.safeParse(body);
    if (!settings || !parsed.success) throw new NotFoundException();
    const account = await this.auth
      .authenticate(parsed.data.email, parsed.data.password)
      .catch((error: unknown) => {
        if (error instanceof ProblemException) return undefined;
        throw error;
      });
    if (!account) throw new NotFoundException();
    const now = this.clock.now();
    // Verrou sur le compte : tentatives sérialisées (plafond d'échecs et rejeu exacts).
    const outcome = await withTransaction(this.db, async (tx): Promise<Outcome> => {
      const [row] = await tx
        .select({ role: user.role, secret: user.adminTotpSecret })
        .from(user)
        .where(eq(user.id, account.id))
        .for('update');
      if (row?.role !== 'admin' || !row.secret) return { ok: false };
      const actor = { actorUserId: account.id };
      const [failures] = await tx
        .select({ n: count() })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.actorUserId, account.id),
            eq(auditLog.action, 'admin.login_failed'),
            gte(auditLog.createdAt, new Date(now.getTime() - ADMIN_FAILURE_WINDOW_MS)),
          ),
        );
      if ((failures?.n ?? 0) >= ADMIN_MAX_FAILURES) {
        await recordAdminAudit(tx, { ...actor, action: 'admin.login_blocked' }, now);
        return { ok: false };
      }
      const secret = openSecret(settings.totpKey, row.secret, account.id);
      const step = secret === undefined ? undefined : verifyTotp(secret, parsed.data.code, now);
      // Rejeu : un pas déjà consommé (ou plus ancien) est refusé. La condition est dans le WHERE :
      // 0 ligne = refus, que mysql2 compte les lignes trouvées ou modifiées.
      const [result] =
        step === undefined
          ? [undefined]
          : await tx
              .update(user)
              .set({ adminTotpLastStep: step })
              .where(
                and(
                  eq(user.id, account.id),
                  or(isNull(user.adminTotpLastStep), lt(user.adminTotpLastStep, step)),
                ),
              );
      if (!result || result.affectedRows !== 1) {
        await recordAdminAudit(tx, { ...actor, action: 'admin.login_failed' }, now);
        return { ok: false };
      }
      await recordAdminAudit(tx, { ...actor, action: 'admin.login' }, now);
      return { ok: true, userId: account.id, enrollment: enrollmentOf(row.secret) };
    });
    if (!outcome.ok) throw new NotFoundException();
    return settings.tokens.sign(outcome.userId, outcome.enrollment, now);
  }
}
