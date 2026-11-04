// Réinitialisation du mot de passe par lien à usage unique de 30 min (F-AUTH-03, ADR-019).
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { emailToken, refreshToken, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { ProblemException } from '../errors/problem.exception.js';
import { emailSchema } from './auth.service.js';
import { scheduleThrottledMail } from './mail-throttle.js';
import { OPAQUE_TOKEN_PATTERN, hashOpaqueToken } from './opaque-token.js';
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';
import { passwordResetJob } from './password-reset-email.job.js';

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const passwordResetConfirmSchema = z.object({
  token: z.string().regex(OPAQUE_TOKEN_PATTERN),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

/** Plafond d'envois de liens de réinitialisation par compte et par heure glissante. */
export const RESET_EMAILS_PER_HOUR = 3;
const RESET_KEY_PREFIX = 'reset-password:';
const INVALID_TOKEN = 'Lien de réinitialisation invalide ou expiré';

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Programme l'envoi d'un lien. Aucun effet visible si l'adresse est inconnue (pas d'énumération). */
  async request(email: string): Promise<void> {
    await withTransaction(this.db, async (tx) => {
      // Verrou sur la ligne du compte : deux demandes simultanées ne contournent pas le plafond.
      const [account] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .for('update');
      if (!account) return;
      await scheduleThrottledMail(tx, this.clock, passwordResetJob, {
        prefix: RESET_KEY_PREFIX,
        userId: account.id,
        perHour: RESET_EMAILS_PER_HOUR,
      });
    });
  }

  /**
   * Consomme le jeton, remplace le mot de passe, invalide les autres liens de réinitialisation et
   * révoque toutes les sessions du compte. Le verrou `user … FOR UPDATE` sérialise avec la rotation
   * des jetons de rafraîchissement (ADR-018) : aucun refresh ne survit à la réinitialisation.
   */
  async confirm(token: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const tokenHash = hashOpaqueToken(token);
    const now = this.clock.now();
    const ok = await withTransaction(this.db, async (tx) => {
      const [owner] = await tx
        .select({ userId: emailToken.userId })
        .from(emailToken)
        .where(and(eq(emailToken.tokenHash, tokenHash), eq(emailToken.purpose, 'reset_password')));
      if (!owner) return false;
      const [account] = await tx
        .select({ verifiedAt: user.emailVerifiedAt })
        .from(user)
        .where(eq(user.id, owner.userId))
        .for('update');
      // Consommation conditionnelle : sous concurrence, une seule requête trouve la ligne libre.
      const [consumed] = await tx
        .update(emailToken)
        .set({ consumedAt: now })
        .where(
          and(
            eq(emailToken.tokenHash, tokenHash),
            eq(emailToken.purpose, 'reset_password'),
            isNull(emailToken.consumedAt),
            gt(emailToken.expiresAt, now),
          ),
        );
      if (consumed.affectedRows !== 1) return false;
      await tx
        .update(emailToken)
        .set({ consumedAt: now })
        .where(
          and(
            eq(emailToken.userId, owner.userId),
            eq(emailToken.purpose, 'reset_password'),
            isNull(emailToken.consumedAt),
          ),
        );
      // Le lien est arrivé dans la boîte de l'adresse : elle est prouvée (ADR-019).
      await tx
        .update(user)
        .set({ passwordHash, emailVerifiedAt: account?.verifiedAt ?? now, updatedAt: now })
        .where(eq(user.id, owner.userId));
      await tx
        .update(refreshToken)
        .set({ revokedAt: now })
        .where(and(eq(refreshToken.userId, owner.userId), isNull(refreshToken.revokedAt)));
      return true;
    });
    if (!ok) throw new ProblemException(400, INVALID_TOKEN);
  }
}
