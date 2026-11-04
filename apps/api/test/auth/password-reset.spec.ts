// F-AUTH-03 : réinitialisation du mot de passe par lien à usage unique valable 30 min (ADR-019).
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { and, eq, lte } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD_RESET_TTL_MS,
  passwordResetEmailHandler,
} from '../../src/auth/password-reset-email.job.js';
import { generateOpaqueToken } from '../../src/auth/opaque-token.js';
import { RESET_EMAILS_PER_HOUR } from '../../src/auth/password-reset.service.js';
import { emailToken, job, refreshToken, user } from '../../src/db/schema/index.js';
import { newId, uuidToBinary } from '../../src/db/uuid.js';
import { runJobs } from '../../src/jobs/job-runner.js';
import { InMemoryMailer } from '../../src/mail/mailer.js';
import { http, type LogCapture, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

const PUBLIC_WEB_URL = 'https://app.depenseo.test';
const NEW_PASSWORD = 'un tout nouveau secret';

describe('réinitialisation du mot de passe (F-AUTH-03)', () => {
  // Plage run_at propre à cette suite (mars 2026) : voir les pièges SKIP LOCKED de PROGRESS.md.
  const clock = new FakeClock(Date.UTC(2026, 2, 10, 8, 0, 0));
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

  const requestReset = (email: unknown) =>
    request(http(app)).post('/api/v1/auth/password-reset/request').send({ email });
  const confirm = (token: unknown, password: unknown) =>
    request(http(app)).post('/api/v1/auth/password-reset/confirm').send({ token, password });
  const login = (email: string, password: string) =>
    request(http(app)).post('/api/v1/auth/login').send({ email, password });
  const refresh = (token: string) =>
    request(http(app)).post('/api/v1/auth/refresh').send({ refreshToken: token });

  const resetJobsOf = async (userId: string) =>
    (await db.select().from(job).where(eq(job.type, 'mail.reset_password'))).filter(
      (row) => (JSON.parse(row.payload) as { userId: string }).userId === userId,
    );

  const silent = () => undefined;
  const sendMails = async () => {
    for (let pass = 0; pass < 5; pass += 1) {
      await runJobs({
        db,
        clock,
        logger: { info: silent, warn: silent, error: silent },
        handlers: [passwordResetEmailHandler({ db, clock, mailer, publicWebUrl: PUBLIC_WEB_URL })],
      });
      const due = await db
        .select({ id: job.id })
        .from(job)
        .where(
          and(
            eq(job.type, 'mail.reset_password'),
            eq(job.status, 'pending'),
            lte(job.runAt, clock.now()),
          ),
        );
      if (due.length === 0) return;
    }
    throw new Error('envois toujours en attente');
  };

  const tokenSentTo = (email: string): string => {
    const mail = mailer.outbox.findLast((m) => m.to === email);
    if (!mail) throw new Error('aucun e-mail reçu');
    const match = /\/reset-password#token=([A-Za-z0-9_-]+)/.exec(mail.text);
    if (!match?.[1]) throw new Error('lien absent');
    return match[1];
  };

  /** Demande + envoi : renvoie le jeton reçu par e-mail. */
  const resetLinkFor = async (email: string) => {
    await requestReset(email).expect(202);
    await sendMails();
    return tokenSentTo(email);
  };

  it('envoie un lien de 30 min (empreinte seule stockée) ; réponse identique pour une adresse inconnue', async () => {
    const account = await createUser(db, clock.now());
    const known = await requestReset(account.email.toUpperCase()).expect(202);
    const unknown = await requestReset(`inconnu.${newId()}@example.test`).expect(202);
    expect(unknown.body).toEqual(known.body);
    expect(unknown.text).toBe(known.text);

    const jobs = await resetJobsOf(account.id);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]!.payload)).toEqual({ userId: account.id });

    await sendMails();
    const mail = mailer.outbox.findLast((m) => m.to === account.email);
    expect(mail?.subject).toMatch(/Réinitialisez votre mot de passe/);
    const token = tokenSentTo(account.email);
    expect(mail!.text).toContain(`${PUBLIC_WEB_URL}/reset-password#token=${token}`);

    const tokens = await db.select().from(emailToken).where(eq(emailToken.userId, account.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.purpose).toBe('reset_password');
    expect(tokens[0]!.tokenHash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(tokens[0]!.expiresAt.getTime()).toBe(clock.now().getTime() + PASSWORD_RESET_TTL_MS);
    expect(PASSWORD_RESET_TTL_MS).toBe(30 * 60_000);
  });

  it('remplace le mot de passe, révoque toutes les sessions ; second usage du lien refusé', async () => {
    const account = await createUser(db, clock.now());
    const phone = (await login(account.email, account.password).expect(200)).body as {
      refreshToken: string;
    };
    const laptop = (await login(account.email, account.password).expect(200)).body as {
      refreshToken: string;
    };
    const token = await resetLinkFor(account.email);

    await confirm(token, NEW_PASSWORD).expect(204);

    const [row] = await db.select().from(user).where(eq(user.id, account.id));
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    await login(account.email, account.password).expect(401);
    await login(account.email, NEW_PASSWORD).expect(200);

    // Les deux familles ouvertes avant la réinitialisation sont révoquées.
    await refresh(phone.refreshToken).expect(401);
    await refresh(laptop.refreshToken).expect(401);
    const after = await db
      .select({ revokedAt: refreshToken.revokedAt })
      .from(refreshToken)
      .where(eq(refreshToken.userId, account.id));
    expect(after.filter((r) => r.revokedAt === null)).toHaveLength(1); // la connexion d'après

    const second = await confirm(token, 'encore un autre secret').expect(400);
    expect((second.body as { detail: string }).detail).toMatch(/invalide ou expiré/);
    await login(account.email, NEW_PASSWORD).expect(200);
  });

  it('deux confirmations simultanées du même lien : une seule aboutit', async () => {
    const account = await createUser(db, clock.now());
    const token = await resetLinkFor(account.email);
    const results = await Promise.all([
      confirm(token, NEW_PASSWORD),
      confirm(token, 'encore un autre secret'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('demandes simultanées : un seul envoi programmé (verrou sur le compte)', async () => {
    const account = await createUser(db, clock.now());
    const results = await Promise.all(Array.from({ length: 4 }, () => requestReset(account.email)));
    expect(results.map((r) => r.status)).toEqual([202, 202, 202, 202]);
    expect(await resetJobsOf(account.id)).toHaveLength(1);
    await sendMails();
  });

  it('attend une rotation en cours (verrou du compte) et révoque le refresh qu’elle émet', async () => {
    const account = await createUser(db, clock.now());
    const token = await resetLinkFor(account.email);
    // Rotation simulée sur une autre connexion : verrou `user` puis insertion non validée d'un
    // successeur, comme SessionService.refresh entre son verrou et son COMMIT (ADR-018).
    const other = testDb(1);
    const holder = await other.pool.promise().getConnection();
    const successorId = newId();
    let settled = false;
    try {
      await holder.query('START TRANSACTION');
      await holder.query('SELECT id FROM user WHERE id = ? FOR UPDATE', [uuidToBinary(account.id)]);
      await holder.query(
        'INSERT INTO refresh_token (id, user_id, family_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          uuidToBinary(successorId),
          uuidToBinary(account.id),
          uuidToBinary(newId()),
          generateOpaqueToken().tokenHash,
          new Date(clock.now().getTime() + 86_400_000),
          clock.now(),
        ],
      );
      const pending = confirm(token, NEW_PASSWORD).then((res) => {
        settled = true;
        return res;
      });
      // Barrière : la confirmation attend le verrou (requête visible dans PROCESSLIST, même compte
      // SQL, sans privilège PROCESS) ou s'est terminée, si elle ne le prend pas.
      for (let i = 0; i < 200 && !settled; i += 1) {
        const [rows] = await pool
          .promise()
          .query<({ n: number } & RowDataPacket)[]>(
            "SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE COMMAND IN ('Query', 'Execute') AND INFO LIKE '%from `user`%for update%'",
          );
        if (Number(rows[0]!.n) > 0) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      await holder.query('COMMIT');
      expect((await pending).status).toBe(204);
    } finally {
      holder.release();
      await other.pool.promise().end();
    }
    const [successor] = await db
      .select({ revokedAt: refreshToken.revokedAt })
      .from(refreshToken)
      .where(eq(refreshToken.id, successorId));
    expect(successor!.revokedAt).toEqual(clock.now());
  });

  it('accepte le lien à 30 min − 1 s, le refuse à 30 min + 1 s', async () => {
    const early = await createUser(db, clock.now());
    const late = await createUser(db, clock.now());
    const earlyToken = await resetLinkFor(early.email);
    const lateToken = await resetLinkFor(late.email);

    clock.advance(PASSWORD_RESET_TTL_MS - 1_000);
    await confirm(earlyToken, NEW_PASSWORD).expect(204);
    clock.advance(2_000);
    await confirm(lateToken, NEW_PASSWORD).expect(400);
    await login(late.email, late.password).expect(200);
  });

  it('un lien consommé invalide les autres liens de réinitialisation du compte', async () => {
    clock.advance(3_600_000);
    const account = await createUser(db, clock.now());
    const first = await resetLinkFor(account.email);
    const second = await resetLinkFor(account.email);
    expect(second).not.toBe(first);

    await confirm(second, NEW_PASSWORD).expect(204);
    await confirm(first, 'encore un autre secret').expect(400);
  });

  it('ne confond pas les usages : un jeton de vérification d’adresse est refusé', async () => {
    const account = await createUser(db, clock.now(), { verified: false });
    const token = await resetLinkFor(account.email);
    const verify = await request(http(app))
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(400);
    expect((verify.body as { detail: string }).detail).toMatch(/invalide ou expiré/);
    const [stored] = await db
      .select({ consumedAt: emailToken.consumedAt })
      .from(emailToken)
      .where(eq(emailToken.tokenHash, createHash('sha256').update(token).digest()));
    expect(stored!.consumedAt).toBeNull();
  });

  it('refuse un jeton de vérification d’adresse présenté à la réinitialisation', async () => {
    const account = await createUser(db, clock.now(), { verified: false });
    const { token, tokenHash } = generateOpaqueToken();
    await db.insert(emailToken).values({
      id: newId(),
      userId: account.id,
      purpose: 'verify_email',
      tokenHash,
      expiresAt: new Date(clock.now().getTime() + 3_600_000),
      createdAt: clock.now(),
    });
    await confirm(token, NEW_PASSWORD).expect(400);
    await login(account.email, NEW_PASSWORD).expect(401);
  });

  it('un compte non vérifié qui réinitialise prouve la possession de l’adresse : il est vérifié', async () => {
    const account = await createUser(db, clock.now(), { verified: false });
    await confirm(await resetLinkFor(account.email), NEW_PASSWORD).expect(204);
    const [row] = await db.select().from(user).where(eq(user.id, account.id));
    expect(row!.emailVerifiedAt).toEqual(clock.now());
    await login(account.email, NEW_PASSWORD).expect(200);
  });

  it(`plafonne à ${RESET_EMAILS_PER_HOUR} envois par heure glissante et n'empile pas les envois en attente`, async () => {
    clock.advance(3_600_000);
    const account = await createUser(db, clock.now());
    await requestReset(account.email).expect(202);
    await requestReset(account.email).expect(202);
    expect(await resetJobsOf(account.id)).toHaveLength(1);
    await sendMails();
    for (let i = 1; i < RESET_EMAILS_PER_HOUR + 2; i += 1) {
      await requestReset(account.email).expect(202);
      await sendMails();
    }
    expect(await resetJobsOf(account.id)).toHaveLength(RESET_EMAILS_PER_HOUR);
    clock.advance(3_600_000 + 1_000);
    await requestReset(account.email).expect(202);
    expect(await resetJobsOf(account.id)).toHaveLength(RESET_EMAILS_PER_HOUR + 1);
  });

  it('valide les corps : mot de passe trop court, jeton mal formé → 400', async () => {
    await requestReset('pas-une-adresse').expect(400);
    await confirm('x'.repeat(43), 'court').expect(400);
    await confirm('pas un jeton', NEW_PASSWORD).expect(400);
  });

  it('n’écrit ni adresse, ni jeton, ni mot de passe dans les journaux', async () => {
    const account = await createUser(db, clock.now());
    const token = await resetLinkFor(account.email);
    await confirm(token, NEW_PASSWORD).expect(204);
    const text = logs.text;
    expect(text).not.toContain(account.email);
    expect(text).not.toContain(token);
    expect(text).not.toContain(NEW_PASSWORD);
  });
});
