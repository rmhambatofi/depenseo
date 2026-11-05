// NF-SEC-04 (MASVS-AUTH, ADR-062) : limitation de débit des routes d'authentification, comptée en
// base (plusieurs processus Passenger) par adresse IP et, pour la connexion, par compte.
import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rateLimit } from '../../src/db/schema/index.js';
import { purgeExpiredRateLimits } from '../../src/rate-limit/rate-limit-purge.js';
import { loadConfig } from '../../src/config/env.js';
import {
  bucketKey as keyedBucket,
  RATE_LIMIT_WINDOW_MS,
  rateLimitKey,
} from '../../src/rate-limit/rate-limiter.js';
import { codeAt, createAdmin } from '../support/admin.js';
import { http, startTestApp, TEST_ENV } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { createUser, TEST_PASSWORD } from '../support/users.js';

const PER_IP = 6;
const PER_ACCOUNT = 3;
/** Seuils réduits pour le test ; le proxy de confiance permet de simuler des adresses distinctes. */
const LIMIT_ENV = {
  AUTH_RATE_LIMIT_PER_IP: String(PER_IP),
  AUTH_RATE_LIMIT_PER_ACCOUNT: String(PER_ACCOUNT),
  TRUST_PROXY_HOPS: '1',
};

/** Adresse unique par appel : les seaux d'un test ne débordent pas sur un autre. */
const KEY = rateLimitKey(TEST_ENV.JWT_ACCESS_SECRET);
const bucketKey = (scope: 'ip' | 'account', value: string) => keyedBucket(KEY, scope, value);

const freshIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const unknownEmail = () => `inconnu.${randomInt(1e9)}@example.test`;

describe('limitation de débit sur /auth (NF-SEC-04)', () => {
  // Juin 2026 : plage propre à la suite.
  const clock = new FakeClock(Date.UTC(2026, 5, 3, 10, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock, env: LIMIT_ENV }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const post = (path: string, ip: string, body: Record<string, unknown>) =>
    request(http(app)).post(`/api/v1/auth/${path}`).set('X-Forwarded-For', ip).send(body);

  it(`répond 429 problem+json avec Retry-After à la ${PER_IP + 1}e tentative d'une même adresse`, async () => {
    const ip = freshIp();
    for (let i = 0; i < PER_IP; i++) {
      // Adresses e-mail distinctes : seule la limite par IP joue.
      const res = await post('login', ip, { email: unknownEmail(), password: 'mauvais mot' });
      expect(res.status).toBe(401);
    }
    const blocked = await post('login', ip, { email: unknownEmail(), password: 'mauvais mot' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(blocked.body).toMatchObject({ status: 429 });
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000);

    // Une autre adresse n'est pas affectée.
    const other = await post('login', freshIp(), { email: unknownEmail(), password: 'x' });
    expect(other.status).toBe(401);
  });

  it('bloque aussi une connexion valide une fois le seuil atteint (toutes les tentatives comptent)', async () => {
    const ip = freshIp();
    const user = await createUser(db, clock.now());
    for (let i = 0; i < PER_IP; i++) {
      await post('login', ip, { email: unknownEmail(), password: 'mauvais mot' });
    }
    const res = await post('login', ip, { email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it(`limite à ${PER_ACCOUNT} tentatives par compte, même depuis des adresses différentes`, async () => {
    const user = await createUser(db, clock.now());
    for (let i = 0; i < PER_ACCOUNT; i++) {
      const res = await post('login', freshIp(), { email: user.email, password: 'mauvais mot' });
      expect(res.status).toBe(401);
    }
    // Casse et espaces ignorés : même compte.
    const variant = `  ${user.email.toUpperCase()} `;
    const blocked = await post('login', freshIp(), { email: variant, password: TEST_PASSWORD });
    expect(blocked.status).toBe(429);

    const other = await createUser(db, clock.now());
    const ok = await post('login', freshIp(), { email: other.email, password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('la fenêtre part de la 1re tentative : Retry-After compte depuis elle', async () => {
    const ip = freshIp();
    await post('login', ip, { email: unknownEmail(), password: 'x' });
    clock.advance(5 * 60 * 1000);
    for (let i = 1; i < PER_IP; i++) {
      await post('login', ip, { email: unknownEmail(), password: 'x' });
    }
    const blocked = await post('login', ip, { email: unknownEmail(), password: 'x' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBe(10 * 60);
  });

  it('rouvre à la fin de la fenêtre, avec un décompte reparti de zéro', async () => {
    const ip = freshIp();
    for (let i = 0; i < PER_IP; i++) {
      await post('login', ip, { email: unknownEmail(), password: 'x' });
    }
    expect((await post('login', ip, { email: unknownEmail(), password: 'x' })).status).toBe(429);
    clock.advance(RATE_LIMIT_WINDOW_MS);
    // Nouvelle fenêtre ouverte à cet instant : de nouveau PER_IP tentatives, pas une de plus.
    for (let i = 0; i < PER_IP; i++) {
      expect((await post('login', ip, { email: unknownEmail(), password: 'x' })).status).toBe(401);
      clock.advance(1000);
    }
    const blocked = await post('login', ip, { email: unknownEmail(), password: 'x' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBe(RATE_LIMIT_WINDOW_MS / 1000 - PER_IP);
  });

  it('table réduite à l’empreinte et au compteur (hors export et suppression du compte)', async () => {
    const [columns] = await pool.promise().query<import('mysql2').RowDataPacket[]>(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rate_limit' ORDER BY COLUMN_NAME`,
    );
    expect(columns.map((c) => String(c.name))).toEqual(['bucket', 'hits', 'window_started_at']);
  });

  it('exige TRUST_PROXY_HOPS en production (sinon un seul seau pour tous les clients)', () => {
    const production = { ...TEST_ENV, NODE_ENV: 'production' };
    expect(() => loadConfig(production)).toThrow(/TRUST_PROXY_HOPS : absente/);
    expect(loadConfig({ ...production, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(1);
  });

  it.each([
    ['register', () => ({ email: unknownEmail(), password: 'x', acceptTerms: true })],
    ['verify-email', () => ({ token: 'x' })],
    ['social', () => ({ provider: 'google', idToken: 'x' })],
    ['password-reset/request', () => ({ email: unknownEmail() })],
    ['password-reset/confirm', () => ({ token: 'x', password: 'x' })],
  ])('limite aussi POST /auth/%s par adresse', async (path, body) => {
    const ip = freshIp();
    for (let i = 0; i < PER_IP; i++) {
      expect((await post(path, ip, body())).status).not.toBe(429);
    }
    expect((await post(path, ip, body())).status).toBe(429);
  });

  it.each(['refresh', 'logout'])(
    'ne limite pas POST /auth/%s (jeton aléatoire de 256 bits, rien à deviner)',
    async (path) => {
      const ip = freshIp();
      for (let i = 0; i < PER_IP + 2; i++) {
        expect((await post(path, ip, { refreshToken: 'x' })).status).not.toBe(429);
      }
    },
  );

  describe('connexion admin POST /admin/api/session (NF-SEC-04, NF-SEC-06, ADR-067)', () => {
    const adminPost = (ip: string, body: Record<string, unknown>) =>
      request(http(app)).post('/admin/api/session').set('X-Forwarded-For', ip).send(body);

    it(`limite par compte (mauvais mot de passe compris) et répond 404, jamais 429`, async () => {
      const admin = await createAdmin(db, clock.now());
      for (let i = 0; i < PER_ACCOUNT; i++) {
        const res = await adminPost(freshIp(), {
          email: admin.email,
          password: 'mauvais',
          code: '000000',
        });
        expect(res.status).toBe(404);
      }
      const blocked = await adminPost(freshIp(), {
        email: admin.email,
        password: admin.password,
        code: codeAt(admin, clock.now()),
      });
      expect(blocked.status).toBe(404);
      expect(blocked.headers['retry-after']).toBeUndefined();
      expect(blocked.headers['set-cookie']).toBeUndefined();
    });

    it('limite par adresse IP, en 404 indiscernable d’une route inexistante', async () => {
      const ip = freshIp();
      for (let i = 0; i < PER_IP; i++) {
        await adminPost(ip, { email: unknownEmail(), password: 'x', code: '000000' });
      }
      const admin = await createAdmin(db, clock.now());
      const blocked = await adminPost(ip, {
        email: admin.email,
        password: admin.password,
        code: codeAt(admin, clock.now()),
      });
      expect(blocked.status).toBe(404);
      expect(blocked.headers['retry-after']).toBeUndefined();
      expect(blocked.headers['set-cookie']).toBeUndefined();
      // Une autre adresse peut toujours se connecter.
      const ok = await adminPost(freshIp(), {
        email: admin.email,
        password: admin.password,
        code: codeAt(admin, clock.now()),
      });
      expect(ok.status).toBe(204);
    });
  });

  it('ne conserve ni adresse IP ni e-mail en clair', async () => {
    const ip = freshIp();
    const email = unknownEmail();
    await post('login', ip, { email, password: 'x' });
    const [rows] = await pool
      .promise()
      .query<import('mysql2').RowDataPacket[]>('SELECT HEX(bucket) AS b FROM rate_limit');
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(Buffer.from(ip).toString('hex').toUpperCase());
    expect(dump).not.toContain(Buffer.from(email).toString('hex').toUpperCase());
  });

  it('purge les fenêtres échues seulement', async () => {
    const exists = async (ip: string) =>
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(rateLimit)
          .where(eq(rateLimit.bucket, bucketKey('ip', ip)))
      )[0]?.n === 1;
    const old = freshIp();
    await post('login', old, { email: unknownEmail(), password: 'x' });
    await purgeExpiredRateLimits().run(db, clock.now());
    expect(await exists(old)).toBe(true);

    clock.advance(RATE_LIMIT_WINDOW_MS);
    const recent = freshIp();
    await post('login', recent, { email: unknownEmail(), password: 'x' });
    await purgeExpiredRateLimits().run(db, clock.now());
    expect(await exists(old)).toBe(false);
    expect(await exists(recent)).toBe(true);
  });
});

describe('adresse cliente sans proxy de confiance (NF-SEC-04)', () => {
  const clock = new FakeClock(Date.UTC(2026, 5, 20, 10, 0, 0));
  const { pool, db } = testDb(1);
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock, env: { ...LIMIT_ENV, TRUST_PROXY_HOPS: '0' } }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const hasBucket = async (ip: string) =>
    (
      await db
        .select()
        .from(rateLimit)
        .where(eq(rateLimit.bucket, bucketKey('ip', ip)))
    ).length === 1;

  it('ignore X-Forwarded-For : l’en-tête ne crée pas de seau, donc ne contourne pas la limite', async () => {
    // Le seau de la boucle locale est partagé avec les autres suites (seuils neutralisés) : on
    // vérifie donc l'adresse retenue, pas le statut.
    const forged = freshIp();
    const res = await request(http(app))
      .post('/api/v1/auth/password-reset/confirm')
      .set('X-Forwarded-For', forged)
      .send({ token: 'x', password: 'x' });
    expect(res.status).not.toBe(500);
    expect(await hasBucket(forged)).toBe(false);
    const loopback = await Promise.all(['127.0.0.1', '::1', '::ffff:127.0.0.1'].map(hasBucket));
    expect(loopback).toContain(true);
  });
});
