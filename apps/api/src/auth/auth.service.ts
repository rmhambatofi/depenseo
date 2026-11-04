// Inscription, vérification d'adresse et contrôle des identifiants (F-AUTH-01, ADR-017).
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { emailToken, job, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { newId } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { JobQueue } from '../jobs/job-queue.js';
import { OPAQUE_TOKEN_PATTERN, hashOpaqueToken } from './opaque-token.js';
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from './password.js';
import { verifyEmailJob } from './verification-email.job.js';

export const LANGUAGES = ['fr', 'en'] as const;

/** Adresse comparée et stockée sans espaces et en minuscules (ADR-015). */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  /** Acceptation des CGU et de la politique de confidentialité (§6), obligatoire. */
  acceptTerms: z.literal(true),
  language: z.enum(LANGUAGES).default('fr'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({ token: z.string().regex(OPAQUE_TOKEN_PATTERN) });

export interface AuthenticatedUser {
  id: string;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Clé d'unicité des tâches d'envoi : préfixe indexé pour retrouver les envois d'un compte. */
const VERIFY_EMAIL_KEY_PREFIX = 'verify-email:';
/** Plafond d'envois de liens par compte et par heure glissante, avant la limitation de débit (P7-03). */
export const VERIFY_EMAILS_PER_HOUR = 3;

const INVALID_TOKEN = 'Lien de vérification invalide ou expiré';

@Injectable()
export class AuthService {
  private readonly jobs: JobQueue;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.jobs = new JobQueue(clock);
  }

  /**
   * Crée le compte et programme l'e-mail de vérification dans la même transaction. Réponse
   * identique si l'adresse est déjà inscrite (pas d'énumération) :
   * - compte vérifié : rien n'est modifié ni envoyé ;
   * - compte non vérifié : mot de passe, langue et consentements sont remplacés, pour qu'un tiers
   *   ne puisse pas pré-inscrire l'adresse d'autrui avec son propre mot de passe (ADR-017). Les
   *   liens déjà envoyés restent valides : ils ne sont pas liés au mot de passe et n'arrivent que
   *   chez le titulaire de l'adresse. Un nouveau lien part (voir `scheduleVerificationEmail`).
   */
  async register(input: RegisterInput): Promise<void> {
    // Toujours calculé, même pour une adresse connue : temps de réponse homogène.
    const passwordHash = await hashPassword(input.password);
    const now = this.clock.now();
    const id = newId();
    await withTransaction(this.db, async (tx) => {
      await tx
        .insert(user)
        .values({
          id,
          email: input.email,
          passwordHash,
          language: input.language,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${user.id}` } });
      // Insertion ou doublon : relu par l'adresse (`affectedRows` ne tranche pas, ADR-016). L'upsert
      // garde un verrou exclusif sur la ligne jusqu'à la fin de la transaction : deux inscriptions
      // simultanées de la même adresse sont sérialisées ici.
      const [account] = await tx
        .select({ id: user.id, verifiedAt: user.emailVerifiedAt })
        .from(user)
        .where(eq(user.email, input.email));
      if (!account) throw new Error('Compte introuvable après insertion');
      if (account.verifiedAt) return;
      if (account.id !== id) {
        await tx
          .update(user)
          .set({
            passwordHash,
            language: input.language,
            termsAcceptedAt: now,
            privacyAcceptedAt: now,
            updatedAt: now,
          })
          .where(eq(user.id, account.id));
      }
      await this.scheduleVerificationEmail(tx, account.id, now);
    });
  }

  /**
   * Programme un lien de vérification, sauf si un envoi est déjà en attente (il tirera son jeton
   * au moment de l'envoi, donc après ce remplacement) ou si le plafond horaire est atteint.
   */
  private async scheduleVerificationEmail(tx: Tx, userId: string, now: Date): Promise<void> {
    const prefix = `${VERIFY_EMAIL_KEY_PREFIX}${userId}:`;
    const recent = await tx
      .select({ status: job.status })
      .from(job)
      .where(
        and(
          like(job.uniqueKey, `${prefix}%`),
          gt(job.createdAt, new Date(now.getTime() - 3_600_000)),
        ),
      );
    if (recent.some((row) => row.status === 'pending')) return;
    if (recent.length >= VERIFY_EMAILS_PER_HOUR) return;
    await this.jobs.enqueue(tx, verifyEmailJob, { userId }, { uniqueKey: `${prefix}${newId()}` });
  }

  /** Consomme un jeton de vérification (usage unique, non expiré) et marque l'adresse vérifiée. */
  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const now = this.clock.now();
    const ok = await withTransaction(this.db, async (tx) => {
      // Consommation conditionnelle : sous concurrence, une seule requête trouve encore la ligne
      // non consommée (la seconde attend le verrou puis relit `consumed_at` renseigné).
      const [consumed] = await tx
        .update(emailToken)
        .set({ consumedAt: now })
        .where(
          and(
            eq(emailToken.tokenHash, tokenHash),
            eq(emailToken.purpose, 'verify_email'),
            isNull(emailToken.consumedAt),
            gt(emailToken.expiresAt, now),
          ),
        );
      if (consumed.affectedRows !== 1) return false;
      const [row] = await tx
        .select({ userId: emailToken.userId })
        .from(emailToken)
        .where(eq(emailToken.tokenHash, tokenHash));
      if (!row) throw new Error('Jeton introuvable après consommation');
      await tx
        .update(user)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(and(eq(user.id, row.userId), isNull(user.emailVerifiedAt)));
      return true;
    });
    if (!ok) throw new ProblemException(400, INVALID_TOKEN);
  }

  /**
   * Contrôle e-mail + mot de passe (utilisé par la connexion, P1-06). Le refus pour adresse non
   * vérifiée n'est donné qu'après un mot de passe correct : il ne révèle rien à un tiers.
   */
  async authenticate(email: string, password: string): Promise<AuthenticatedUser> {
    const parsed = emailSchema.safeParse(email);
    const [account] = parsed.success
      ? await this.db
          .select({
            id: user.id,
            passwordHash: user.passwordHash,
            verifiedAt: user.emailVerifiedAt,
          })
          .from(user)
          .where(eq(user.email, parsed.data))
      : [];
    const valid = await verifyPassword(account?.passwordHash, password);
    if (!account || !valid) throw new ProblemException(401, 'Identifiants invalides');
    if (!account.verifiedAt) throw new ProblemException(403, 'Adresse e-mail non vérifiée');
    return { id: account.id };
  }
}
