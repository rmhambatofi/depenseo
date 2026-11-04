// F-AUTH-01, NF-SEC-02 : connexion e-mail + mot de passe, jeton d'accès JWT de 15 min.
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_TTL_S, REFRESH_TOKEN_TTL_S } from '../../src/auth/session-tokens.js';
import { refreshToken } from '../../src/db/schema/index.js';
import { http, type LogCapture, startTestApp, TEST_ENV } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

describe('connexion et jeton d’accès (F-AUTH-01, NF-SEC-02)', () => {
  const clock = new FakeClock(Date.UTC(2026, 1, 10, 8, 0, 0));
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

  const login = (body: Record<string, unknown>) =>
    request(http(app)).post('/api/v1/auth/login').send(body);
  const me = (authorization?: string) => {
    const req = request(http(app)).get('/api/v1/me');
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };
  const secret = new TextEncoder().encode(TEST_ENV.JWT_ACCESS_SECRET);

  it('renvoie un jeton d’accès de 15 min et un jeton de rafraîchissement opaque, stocké haché', async () => {
    const account = await createUser(db, clock.now());
    const res = await login({ email: account.email.toUpperCase(), password: account.password });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      tokenType: 'Bearer',
      accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/) as unknown,
      expiresIn: 15 * 60,
      refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
      refreshExpiresIn: REFRESH_TOKEN_TTL_S,
    });

    const body = res.body as { accessToken: string; refreshToken: string };
    const rows = await db.select().from(refreshToken).where(eq(refreshToken.userId, account.id));
    expect(rows).toHaveLength(1);
    const expectedHash = createHash('sha256').update(body.refreshToken).digest();
    expect(Buffer.from(rows[0]!.tokenHash).equals(expectedHash)).toBe(true);
    expect(rows[0]!.expiresAt.getTime()).toBe(clock.now().getTime() + REFRESH_TOKEN_TTL_S * 1000);

    const profile = await me(`Bearer ${body.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ id: account.id, email: account.email });

    // Ni jeton, ni adresse, ni mot de passe dans le journal (NF-SEC-06).
    expect(logs.text).not.toContain(body.accessToken);
    expect(logs.text).not.toContain(body.refreshToken);
    expect(logs.text).not.toContain(account.email);
    expect(logs.text).not.toContain(account.password);
  });

  it('refuse le jeton d’accès à 15 min pile (horloge injectée), l’accepte à 14 min 59 s', async () => {
    const account = await createUser(db, clock.now());
    const res = await login({ email: account.email, password: account.password });
    const { accessToken } = res.body as { accessToken: string };
    clock.advance(ACCESS_TOKEN_TTL_S * 1000 - 1000);
    expect((await me(`Bearer ${accessToken}`)).status).toBe(200);
    clock.advance(1000);
    const expired = await me(`Bearer ${accessToken}`);
    expect(expired.status).toBe(401);
    expect(expired.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('répond 401 identique pour une adresse inconnue ou un mauvais mot de passe, 403 si non vérifiée', async () => {
    const account = await createUser(db, clock.now());
    const wrong = await login({ email: account.email, password: 'mauvais mot de passe' });
    const unknown = await login({ email: 'personne@example.test', password: account.password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);

    const unverified = await createUser(db, clock.now(), { verified: false });
    const res = await login({ email: unverified.email, password: unverified.password });
    expect(res.status).toBe(403);
    const rows = await db.select().from(refreshToken).where(eq(refreshToken.userId, unverified.id));
    expect(rows).toHaveLength(0);
  });

  it('refuse un corps invalide (400)', async () => {
    expect((await login({ email: 'x@example.test' })).status).toBe(400);
    expect((await login({ email: 42, password: 'abcdefgh' })).status).toBe(400);
  });

  it('refuse toute requête protégée sans jeton d’accès valide (401)', async () => {
    const account = await createUser(db, clock.now());
    const now = Math.floor(clock.now().getTime() / 1000);
    interface Forged {
      key?: Uint8Array;
      alg?: string;
      sub?: string;
      iss?: string;
      aud?: string;
      exp?: number | null;
    }
    const forge = (options: Forged = {}) => {
      const jwt = new SignJWT({})
        .setProtectedHeader({ alg: options.alg ?? 'HS256' })
        .setSubject(options.sub ?? account.id)
        .setIssuer(options.iss ?? 'depenseo')
        .setAudience(options.aud ?? 'depenseo-api')
        .setIssuedAt(now);
      if (options.exp !== null) jwt.setExpirationTime(options.exp ?? now + 600);
      return jwt.sign(options.key ?? secret);
    };

    const valid = await forge();
    expect((await me(`Bearer ${valid}`)).status).toBe(200);
    // Schéma insensible à la casse (RFC 7235).
    expect((await me(`bearer ${valid}`)).status).toBe(200);

    const otherKey = new TextEncoder().encode('une-autre-cle-une-autre-cle-une-autre-cle');
    const [header, payload, signature] = valid.split('.');
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${payload}.`;
    const unsignedWithDummy = `${encode({ alg: 'none', typ: 'JWT' })}.${payload}.${signature}`;
    const tampered = `${header}.${encode({
      sub: account.id,
      iss: 'depenseo',
      aud: 'depenseo-api',
      iat: now,
      exp: now + 9e6,
    })}.${signature}`;

    for (const authorization of [
      undefined,
      '',
      'Bearer',
      `Basic ${valid}`,
      `Bearer ${await forge({ key: otherKey })}`,
      // Bonne clé mais autre algorithme HMAC : seul HS256 est admis.
      `Bearer ${await forge({ alg: 'HS512' })}`,
      `Bearer ${unsigned}`,
      `Bearer ${unsignedWithDummy}`,
      `Bearer ${tampered}`,
      `Bearer ${await forge({ aud: 'autre' })}`,
      `Bearer ${await forge({ iss: 'autre' })}`,
      `Bearer ${await forge({ exp: null })}`,
      `Bearer ${await forge({ sub: 'admin' })}`,
      'Bearer pas.un.jwt',
    ]) {
      const res = await me(authorization);
      expect(res.status, String(authorization)).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
    }
  });
});
