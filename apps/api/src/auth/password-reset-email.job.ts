// Envoi du lien de réinitialisation du mot de passe (F-AUTH-03, ADR-019). Comme pour la
// vérification d'adresse, la tâche ne porte que l'identifiant du compte : le jeton est tiré ici.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { emailToken, user } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';
import { defineJob } from '../jobs/job-queue.js';
import type { JobHandler } from '../jobs/job-runner.js';
import type { Mailer, MailMessage } from '../mail/mailer.js';
import { generateOpaqueToken } from './opaque-token.js';

/** Validité d'un lien de réinitialisation (F-AUTH-03). */
export const PASSWORD_RESET_TTL_MS = 30 * 60_000;

export const passwordResetJob = defineJob(
  'mail.reset_password',
  z.strictObject({ userId: z.uuid() }),
);

export interface PasswordResetEmailDeps {
  db: Database;
  clock: Clock;
  mailer: Mailer;
  /** Origine de l'application web (lien universel ouvert aussi par l'app mobile). */
  publicWebUrl: string;
}

export function passwordResetEmailMessage(to: string, language: string, link: string): MailMessage {
  if (language === 'en') {
    return {
      to,
      subject: 'Depenseo – Reset your password',
      text: [
        'A password reset was requested for your Depenseo account.',
        '',
        'To choose a new password, open this link within 30 minutes (it can be used only once):',
        link,
        '',
        'All your devices will be signed out.',
        'If you did not request this, you can ignore this email: your password is unchanged.',
      ].join('\n'),
    };
  }
  return {
    to,
    subject: 'Depenseo – Réinitialisez votre mot de passe',
    text: [
      'Une réinitialisation du mot de passe a été demandée pour votre compte Depenseo.',
      '',
      'Pour choisir un nouveau mot de passe, ouvrez ce lien dans les 30 minutes (il ne sert qu’une fois) :',
      link,
      '',
      'Tous vos appareils seront déconnectés.',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
    ].join('\n'),
  };
}

export function passwordResetEmailHandler(
  deps: PasswordResetEmailDeps,
): JobHandler<z.infer<typeof passwordResetJob.payload>> {
  const base = deps.publicWebUrl.replace(/\/+$/, '');
  return {
    definition: passwordResetJob,
    async handle({ userId }, { signal }) {
      const [account] = await deps.db
        .select({ email: user.email, language: user.language })
        .from(user)
        .where(eq(user.id, userId));
      // Compte supprimé entre-temps : rien à envoyer.
      if (!account) return;
      const now = deps.clock.now();
      const { token, tokenHash } = generateOpaqueToken();
      await deps.db.insert(emailToken).values({
        id: newId(),
        userId,
        purpose: 'reset_password',
        tokenHash,
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        createdAt: now,
      });
      // Fragment (#) : le jeton n'est jamais transmis au serveur web ni écrit dans ses journaux.
      const link = `${base}/reset-password#token=${token}`;
      await deps.mailer.send(
        passwordResetEmailMessage(account.email, account.language, link),
        signal,
      );
    },
  };
}
