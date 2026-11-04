// Envoi d'e-mails transactionnels (F-AUTH-01/03). Appelé uniquement par les gestionnaires de la
// file de tâches (cron), jamais pendant une requête HTTP : une panne SMTP n'échoue pas l'inscription.
import nodemailer, { type SendMailOptions } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage, signal?: AbortSignal): Promise<void>;
}

/** Faux en mémoire (tests, développement) : les messages sont gardés dans `outbox`. */
export class InMemoryMailer implements Mailer {
  readonly outbox: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.outbox.push({ ...message });
    return Promise.resolve();
  }
}

export const SMTP_TIMEOUT_MS = 15_000;

/** Sous-ensemble du transport nodemailer utilisé (substituable en test). */
export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

/** Adaptateur SMTP (nodemailer). L'erreur du transport est relancée sans son message (PII). */
export class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  /**
   * Délais bornés (15 s) : un serveur muet ne doit pas dépasser le délai du gestionnaire (30 s)
   * ni le passage cron (50 s), sinon la tâche est rejouée et un second lien envoyé.
   */
  static fromUrl(smtpUrl: string, from: string): SmtpMailer {
    const transport = nodemailer.createTransport({
      url: smtpUrl,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    return new SmtpMailer(transport, from);
  }

  async send(message: MailMessage, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Les messages SMTP recopient parfois l'adresse du destinataire : seuls le code de réponse
      // SMTP (ex. 550) ou le code nodemailer (ex. ETIMEDOUT) sont gardés.
      const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
      const reason =
        typeof responseCode === 'number'
          ? String(responseCode)
          : typeof code === 'string'
            ? code
            : 'error';
      throw Object.assign(new Error('Envoi SMTP refusé'), {
        name: 'MailSendError',
        code: `smtp_${reason}`,
      });
    }
  }
}
