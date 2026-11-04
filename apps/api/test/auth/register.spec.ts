// F-AUTH-01 : inscription e-mail + mot de passe, vérification de l'e-mail par jeton à usage unique.
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { and, eq, lte } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService, VERIFY_EMAILS_PER_HOUR } from '../../src/auth/auth.service.js';
import {
  VERIFY_EMAIL_TTL_MS,
  verificationEmailHandler,
} from '../../src/auth/verification-email.job.js';
import { emailToken, job, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { runJobs } from '../../src/jobs/job-runner.js';
import { InMemoryMailer } from '../../src/mail/mailer.js';
import { http, type LogCapture, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

const PUBLIC_WEB_URL = 'https://app.depenseo.test';
const PASSWORD = 'correct horse battery';
const OTHER_PASSWORD = 'mot de passe du tiers';

describe('inscription et vérification de l’e-mail (F-AUTH-01)', () => {
  // Avant les échéances des suites de la file (2026-11-04) : les réclamations de ce fichier
  // parcourent l'index (status, run_at) sans toucher leurs lignes, ni l'inverse (SKIP LOCKED).
  const clock = new FakeClock(Date.UTC(2026, 0, 5, 8, 0, 0));
  const mailer = new InMemoryMailer();
  const { pool, db } = testDb(2);
  let app: INestApplication;
  let logs: LogCapture;

  beforeAll(async () => {
    ({ app, logs } = await startTestApp({ clock }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const uniqueEmail = () => `Inscrit.${newId()}@Example.TEST`;
  const register = (body: Record<string, unknown>) =>
    request(http(app)).post('/api/v1/auth/register').send(body);
  const verify = (token: unknown) =>
    request(http(app)).post('/api/v1/auth/verify-email').send({ token });

  const userByEmail = async (email: string) => {
    const [row] = await db.select().from(user).where(eq(user.email, email.toLowerCase()));
    return row;
  };
  const verifyJobsOf = async (userId: string) =>
    (await db.select().from(job).where(eq(job.type, 'mail.verify_email'))).filter(
      (row) => (JSON.parse(row.payload) as { userId: string }).userId === userId,
    );

  const jobLogLines: string[] = [];
  const record = (fields: object, message: string) =>
    jobLogLines.push(JSON.stringify({ ...fields, message }));
  const jobLogger = { info: record, warn: record, error: record };

  /** Traite les envois dus ; recommence si une ligne a été sautée (verrouillée par une autre suite). */
  const sendMails = async () => {
    for (let pass = 0; pass < 5; pass += 1) {
      await runJobs({
        db,
        clock,
        logger: jobLogger,
        handlers: [verificationEmailHandler({ db, clock, mailer, publicWebUrl: PUBLIC_WEB_URL })],
      });
      const due = await db
        .select({ id: job.id })
        .from(job)
        .where(
          and(
            eq(job.type, 'mail.verify_email'),
            eq(job.status, 'pending'),
            lte(job.runAt, clock.now()),
          ),
        );
      if (due.length === 0) return;
    }
    throw new Error('envois toujours en attente');
  };

  const tokenSentTo = (email: string): string => {
    const mail = mailer.outbox.findLast((m) => m.to === email.toLowerCase());
    if (!mail) throw new Error('aucun e-mail reçu');
    const match = /\/verify-email#token=([A-Za-z0-9_-]+)/.exec(mail.text);
    if (!match?.[1]) throw new Error('lien absent');
    return match[1];
  };

  it('crée le compte (argon2id), puis envoie un lien de vérification via la file', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);

    const created = await userByEmail(email);
    expect(created).toBeDefined();
    expect(created!.email).toBe(email.toLowerCase());
    expect(created!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(created!.passwordHash).not.toContain(PASSWORD);
    expect(created!.emailVerifiedAt).toBeNull();
    expect(created!.termsAcceptedAt).toEqual(clock.now());
    expect(created!.privacyAcceptedAt).toEqual(clock.now());

    const jobs = await verifyJobsOf(created!.id);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]!.payload)).toEqual({ userId: created!.id });

    await sendMails();
    const mail = mailer.outbox.findLast((m) => m.to === email.toLowerCase());
    expect(mail?.subject).toMatch(/Confirmez votre adresse e-mail/);
    const token = tokenSentTo(email);
    expect(mail!.text).toContain(`${PUBLIC_WEB_URL}/verify-email#token=${token}`);

    // Seule l'empreinte SHA-256 du jeton est stockée.
    const tokens = await db.select().from(emailToken).where(eq(emailToken.userId, created!.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.purpose).toBe('verify_email');
    expect(tokens[0]!.tokenHash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(tokens[0]!.expiresAt.getTime()).toBe(clock.now().getTime() + VERIFY_EMAIL_TTL_MS);
  });

  it('refuse la connexion avant vérification, l’accepte après ; le jeton ne sert qu’une fois', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
    await sendMails();
    const auth = app.get(AuthService);

    await expect(auth.authenticate(email, PASSWORD)).rejects.toMatchObject({
      status: 403,
      detail: expect.stringMatching(/non vérifiée/) as unknown,
    });

    const token = tokenSentTo(email);
    await verify(token).expect(204);
    const verified = await userByEmail(email);
    expect(verified!.emailVerifiedAt).toEqual(clock.now());

    const second = await verify(token).expect(400);
    expect(second.headers['content-type']).toMatch(/application\/problem\+json/);

    await expect(auth.authenticate(` ${email.toUpperCase()} `, PASSWORD)).resolves.toMatchObject({
      id: verified!.id,
    });
    await expect(auth.authenticate(email, 'mauvais mot de passe')).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.authenticate(uniqueEmail(), PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('refuse un jeton expiré (validité 24 h), inconnu ou mal formé', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
    await sendMails();
    const token = tokenSentTo(email);

    clock.advance(VERIFY_EMAIL_TTL_MS + 1_000);
    await verify(token).expect(400);
    expect((await userByEmail(email))!.emailVerifiedAt).toBeNull();

    await verify('A'.repeat(43)).expect(400);
    await verify('pas un jeton !').expect(400);
    await verify(undefined).expect(400);
  });

  it('répond pareil pour une adresse déjà inscrite, sans doubler le compte ni l’envoi en attente', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
    const first = await userByEmail(email);

    const again = await register({
      email: email.toUpperCase(),
      password: OTHER_PASSWORD,
      acceptTerms: true,
    });
    expect(again.status).toBe(202);
    expect(again.text).toBe('');

    const rows = await db.select().from(user).where(eq(user.email, email.toLowerCase()));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first!.id);
    // Un seul envoi en attente : il tirera son jeton au moment de l'envoi.
    expect(await verifyJobsOf(first!.id)).toHaveLength(1);

    // Compte vérifié : ni mot de passe remplacé ni nouvel e-mail, même plus tard.
    await sendMails();
    await verify(tokenSentTo(email)).expect(204);
    const verified = await userByEmail(email);
    clock.advance(2 * 3_600_000);
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
    expect(await verifyJobsOf(first!.id)).toHaveLength(1);
    expect((await userByEmail(email))!.passwordHash).toBe(verified!.passwordHash);
  });

  it('empêche la pré-inscription par un tiers : le dernier inscrit fixe le mot de passe, quel que soit le lien cliqué', async () => {
    const email = uniqueEmail();
    const auth = app.get(AuthService);
    // Le tiers inscrit l'adresse de la victime ; le lien part chez la victime.
    await register({ email, password: OTHER_PASSWORD, acceptTerms: true }).expect(202);
    await sendMails();
    const attackerLink = tokenSentTo(email);

    // La victime s'inscrit à son tour avec son mot de passe et sa langue.
    await register({ email, password: PASSWORD, acceptTerms: true, language: 'en' }).expect(202);
    await sendMails();
    const victimLink = tokenSentTo(email);
    expect(victimLink).not.toBe(attackerLink);

    // La victime clique le premier lien reçu : c'est son mot de passe qui vaut.
    await verify(attackerLink).expect(204);
    await verify(victimLink).expect(204);
    expect((await userByEmail(email))!.language).toBe('en');
    await expect(auth.authenticate(email, OTHER_PASSWORD)).rejects.toMatchObject({ status: 401 });
    await expect(auth.authenticate(email, PASSWORD)).resolves.toBeDefined();
  });

  it('plafonne les liens à 3 par heure glissante pour un compte non vérifié', async () => {
    const email = uniqueEmail();
    const registerAndSend = async () => {
      await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
      await sendMails();
    };
    await registerAndSend();
    const created = await userByEmail(email);
    await registerAndSend();
    await registerAndSend();
    await registerAndSend();
    expect(await verifyJobsOf(created!.id)).toHaveLength(VERIFY_EMAILS_PER_HOUR);
    // Plafond atteint : les liens déjà reçus restent utilisables.
    const lastLink = tokenSentTo(email);
    clock.advance(3_600_000 + 1);
    await registerAndSend();
    expect(await verifyJobsOf(created!.id)).toHaveLength(VERIFY_EMAILS_PER_HOUR + 1);
    await verify(lastLink).expect(204);
  });

  it('deux inscriptions simultanées de la même adresse donnent un compte et un envoi', async () => {
    const email = uniqueEmail();
    const results = await Promise.all([
      register({ email, password: PASSWORD, acceptTerms: true }),
      register({ email, password: OTHER_PASSWORD, acceptTerms: true }),
    ]);
    expect(results.map((r) => r.status)).toEqual([202, 202]);
    const rows = await db.select().from(user).where(eq(user.email, email.toLowerCase()));
    expect(rows).toHaveLength(1);
    expect(await verifyJobsOf(rows[0]!.id)).toHaveLength(1);
  });

  it('un jeton présenté deux fois en même temps n’est consommé qu’une fois', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
    await sendMails();
    const token = tokenSentTo(email);
    const auth = app.get(AuthService);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, () => auth.verifyEmail(token)),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(7);
    await verify(token).expect(400);
  });

  it('écrit l’e-mail dans la langue choisie', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true, language: 'en' }).expect(202);
    expect((await userByEmail(email))!.language).toBe('en');
    await sendMails();
    expect(mailer.outbox.findLast((m) => m.to === email.toLowerCase())?.subject).toMatch(
      /Confirm your email address/,
    );
  });

  it.each([
    ['e-mail invalide', { email: 'pas-une-adresse', password: PASSWORD, acceptTerms: true }],
    ['mot de passe trop court', { email: 'a@example.test', password: 'court', acceptTerms: true }],
    [
      'mot de passe trop long',
      { email: 'a@example.test', password: 'x'.repeat(129), acceptTerms: true },
    ],
    ['conditions non acceptées', { email: 'a@example.test', password: PASSWORD }],
    ['conditions refusées', { email: 'a@example.test', password: PASSWORD, acceptTerms: false }],
    [
      'langue inconnue',
      { email: 'a@example.test', password: PASSWORD, acceptTerms: true, language: 'de' },
    ],
  ])('refuse une inscription invalide : %s → 400', async (_label, body) => {
    const res = await register(body).expect(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('ne journalise ni l’adresse, ni le mot de passe, ni le jeton', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, acceptTerms: true }).expect(202);
    await sendMails();
    const token = tokenSentTo(email);
    await verify(token).expect(204);
    await verify(token).expect(400);
    const text = `${logs.text}\n${jobLogLines.join('\n')}`.toLowerCase();
    expect(jobLogLines.length).toBeGreaterThan(0);
    expect(text).not.toContain(email.toLowerCase());
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(token.toLowerCase());
  });
});
