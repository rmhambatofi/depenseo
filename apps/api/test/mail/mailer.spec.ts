import nodemailer, { type SendMailOptions } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { InMemoryMailer, SmtpMailer } from '../../src/mail/mailer.js';

const message = { to: 'destinataire@example.test', subject: 'Sujet', text: 'Corps' };

describe('Mailer', () => {
  it('le faux en mémoire garde une copie des messages', async () => {
    const mailer = new InMemoryMailer();
    await mailer.send(message);
    expect(mailer.outbox).toEqual([message]);
  });

  it('l’adaptateur SMTP compose le message avec l’expéditeur configuré', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sent: unknown[] = [];
    const mailer = new SmtpMailer(
      {
        sendMail: async (options: SendMailOptions) => {
          const info = await transport.sendMail(options);
          sent.push(JSON.parse(info.message));
          return info;
        },
      },
      'Depenseo <no-reply@depenseo.test>',
    );
    await mailer.send(message);
    expect(sent).toEqual([
      expect.objectContaining({
        from: { address: 'no-reply@depenseo.test', name: 'Depenseo' },
        to: [{ address: 'destinataire@example.test', name: '' }],
        subject: 'Sujet',
        text: 'Corps',
      }),
    ]);
  });

  it('relance une erreur SMTP sans son message (qui peut contenir l’adresse)', async () => {
    const mailer = new SmtpMailer(
      {
        sendMail: () =>
          Promise.reject(
            Object.assign(new Error('550 destinataire@example.test inconnu'), {
              code: 'EENVELOPE',
            }),
          ),
      },
      'no-reply@depenseo.test',
    );
    const error = (await mailer.send(message).catch((e: unknown) => e)) as Error & {
      code: string;
    };
    expect(error.code).toBe('smtp_EENVELOPE');
    expect(error.message).not.toContain('destinataire');
  });

  it('garde le code de réponse SMTP (ex. 550) plutôt que le code générique', async () => {
    const mailer = new SmtpMailer(
      {
        sendMail: () =>
          Promise.reject(
            Object.assign(new Error('550 5.1.1 <destinataire@example.test> inconnu'), {
              code: 'EENVELOPE',
              responseCode: 550,
            }),
          ),
      },
      'no-reply@depenseo.test',
    );
    await expect(mailer.send(message)).rejects.toMatchObject({ code: 'smtp_550' });
  });

  it('n’envoie rien si la tâche a déjà été interrompue', async () => {
    let calls = 0;
    const mailer = new SmtpMailer(
      {
        sendMail: () => {
          calls += 1;
          return Promise.resolve({});
        },
      },
      'no-reply@depenseo.test',
    );
    await expect(mailer.send(message, AbortSignal.abort())).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
