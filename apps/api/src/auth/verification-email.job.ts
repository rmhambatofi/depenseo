// Envoi du lien de vérification d'adresse (F-AUTH-01). La tâche ne porte que l'identifiant du
// compte : le jeton est tiré ici, au moment de l'envoi, car seule son empreinte est stockée.
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

/** Validité d'un lien de vérification (ADR-017). */
export const VERIFY_EMAIL_TTL_MS = 24 * 3_600_000;

export const verifyEmailJob = defineJob('mail.verify_email', z.strictObject({ userId: z.uuid() }));

export interface VerificationEmailDeps {
  db: Database;
  clock: Clock;
  mailer: Mailer;
  /** Origine de l'application web (lien universel ouvert aussi par l'app mobile). */
  publicWebUrl: string;
}

export function verificationEmailMessage(to: string, language: string, link: string): MailMessage {
  if (language === 'en') {
    return {
      to,
      subject: 'Depenseo – Confirm your email address',
      text: [
        'Welcome to Depenseo!',
        '',
        'To activate your account, confirm your email address by opening this link within 24 hours:',
        link,
        '',
        'If you did not create an account, you can ignore this email.',
      ].join('\n'),
    };
  }
  return {
    to,
    subject: 'Depenseo – Confirmez votre adresse e-mail',
    text: [
      'Bienvenue sur Depenseo !',
      '',
      'Pour activer votre compte, confirmez votre adresse e-mail en ouvrant ce lien dans les 24 heures :',
      link,
      '',
      'Si vous n’avez pas créé de compte, ignorez simplement cet e-mail.',
    ].join('\n'),
  };
}

export function verificationEmailHandler(
  deps: VerificationEmailDeps,
): JobHandler<z.infer<typeof verifyEmailJob.payload>> {
  const base = deps.publicWebUrl.replace(/\/+$/, '');
  return {
    definition: verifyEmailJob,
    async handle({ userId }, { signal }) {
      const [account] = await deps.db
        .select({ email: user.email, language: user.language, verifiedAt: user.emailVerifiedAt })
        .from(user)
        .where(eq(user.id, userId));
      // Compte supprimé ou déjà vérifié entre-temps : rien à envoyer.
      if (!account || account.verifiedAt) return;
      const now = deps.clock.now();
      const { token, tokenHash } = generateOpaqueToken();
      await deps.db.insert(emailToken).values({
        id: newId(),
        userId,
        purpose: 'verify_email',
        tokenHash,
        expiresAt: new Date(now.getTime() + VERIFY_EMAIL_TTL_MS),
        createdAt: now,
      });
      // Fragment (#) : le jeton n'est jamais transmis au serveur web ni écrit dans ses journaux.
      const link = `${base}/verify-email#token=${token}`;
      await deps.mailer.send(
        verificationEmailMessage(account.email, account.language, link),
        signal,
      );
    },
  };
}
