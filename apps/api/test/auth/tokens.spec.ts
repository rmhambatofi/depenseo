// NF-SEC-02 : jetons de rafraîchissement révocables, rotation à chaque usage, détection de
// réutilisation (révocation de toute la famille), déconnexion.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateOpaqueToken } from '../../src/auth/opaque-token.js';
import { purgeExpiredRefreshTokens } from '../../src/auth/refresh-token-purge.js';
import { REFRESH_TOKEN_TTL_S } from '../../src/auth/session-tokens.js';
import { refreshToken } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { createUser, type TestUser } from '../support/users.js';

interface Session {
  accessToken: string;
  refreshToken: string;
}

describe('jetons de rafraîchissement (NF-SEC-02)', () => {
  const clock = new FakeClock(Date.UTC(2026, 2, 3, 8, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const post = (path: string, body: Record<string, unknown>) =>
    request(http(app)).post(`/api/v1/auth/${path}`).send(body);
  const login = async (account: TestUser): Promise<Session> => {
    const res = await post('login', { email: account.email, password: account.password });
    expect(res.status).toBe(200);
    return res.body as Session;
  };
  const refresh = (token: string) => post('refresh', { refreshToken: token });
  const logout = (token: string) => post('logout', { refreshToken: token });
  const me = (session: Session) =>
    request(http(app)).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`);
  const rowsOf = (userId: string) =>
    db.select().from(refreshToken).where(eq(refreshToken.userId, userId));

  it('échange le jeton contre une nouvelle paire de la même famille (rotation)', async () => {
    const account = await createUser(db, clock.now());
    const first = await login(account);
    clock.advance(60_000);
    const res = await refresh(first.refreshToken);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const second = res.body as Session & { refreshExpiresIn: number };
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.refreshExpiresIn).toBe(REFRESH_TOKEN_TTL_S);
    expect((await me(second)).status).toBe(200);

    const rows = await rowsOf(account.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.familyId)).size).toBe(1);
    const used = rows.filter((row) => row.usedAt !== null);
    expect(used).toHaveLength(1);
    expect(used[0]!.usedAt).toEqual(clock.now());
    expect(rows.every((row) => row.revokedAt === null)).toBe(true);
  });

  it('réutilisation d’un jeton déjà échangé → 401 et révocation de toute la famille', async () => {
    const account = await createUser(db, clock.now());
    const stolen = await login(account);
    const other = await login(account); // autre appareil : autre famille
    const legit = (await refresh(stolen.refreshToken)).body as Session;

    const replay = await refresh(stolen.refreshToken);
    expect(replay.status).toBe(401);
    expect(replay.headers['content-type']).toMatch(/^application\/problem\+json/);

    // Le jeton issu de la rotation est révoqué avec sa famille…
    expect((await refresh(legit.refreshToken)).status).toBe(401);
    const rows = await rowsOf(account.id);
    const family = rows.filter((row) => row.familyId === rows.find((r) => r.usedAt)!.familyId);
    expect(family).toHaveLength(2);
    expect(family.every((row) => row.revokedAt !== null)).toBe(true);
    // … mais l'autre appareil garde sa session.
    expect((await refresh(other.refreshToken)).status).toBe(200);
  });

  it('refuse un jeton révoqué, expiré (30 j) ou inconnu ; 400 si mal formé', async () => {
    const account = await createUser(db, clock.now());
    const session = await login(account);
    expect((await logout(session.refreshToken)).status).toBe(204);
    expect((await refresh(session.refreshToken)).status).toBe(401);

    const late = await login(account);
    clock.advance(REFRESH_TOKEN_TTL_S * 1000 - 1000);
    const renewed = await refresh(late.refreshToken);
    expect(renewed.status).toBe(200);
    clock.advance(REFRESH_TOKEN_TTL_S * 1000);
    expect((await refresh((renewed.body as Session).refreshToken)).status).toBe(401);
    // Simple expiration : refus sans révocation de la famille.
    const family = await rowsOf(account.id);
    expect(family.filter((row) => row.revokedAt === null && row.usedAt === null)).toHaveLength(1);

    // Frontière : refusé à l'échéance exacte, accepté une milliseconde avant.
    const edge = await login(account);
    clock.advance(REFRESH_TOKEN_TTL_S * 1000 - 1);
    const before = await refresh(edge.refreshToken);
    expect(before.status).toBe(200);
    clock.advance(REFRESH_TOKEN_TTL_S * 1000);
    expect((await refresh((before.body as Session).refreshToken)).status).toBe(401);

    expect((await refresh('A'.repeat(43))).status).toBe(401);
    expect((await refresh('court')).status).toBe(400);
    expect((await post('refresh', {})).status).toBe(400);
  });

  it('déconnexion : révoque la famille du jeton présenté seulement ; idempotente', async () => {
    const account = await createUser(db, clock.now());
    const phone = await login(account);
    const tablet = await login(account);
    const rotated = (await refresh(phone.refreshToken)).body as Session;

    // Présenter un jeton déjà échangé déconnecte aussi l'appareil (même famille).
    expect((await logout(phone.refreshToken)).status).toBe(204);
    expect((await refresh(rotated.refreshToken)).status).toBe(401);
    expect((await refresh(tablet.refreshToken)).status).toBe(200);

    expect((await logout(phone.refreshToken)).status).toBe(204);
    expect((await logout('B'.repeat(43))).status).toBe(204);
    expect((await post('logout', { refreshToken: 'court' })).status).toBe(400);
  });

  it('deux échanges simultanés du même jeton : un seul réussit, puis la famille est révoquée', async () => {
    const account = await createUser(db, clock.now());
    const session = await login(account);
    const results = await Promise.all([
      refresh(session.refreshToken),
      refresh(session.refreshToken),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
    const rows = await rowsOf(account.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it('la purge périodique supprime les jetons expirés seulement, par lots', async () => {
    // Échéances en 2025 : avant celles des autres suites, que la purge ne touche donc pas.
    const now = new Date(Date.UTC(2025, 5, 1));
    const account = await createUser(db, now);
    const familyId = newId();
    const row = (expiresAt: Date) => ({
      id: newId(),
      userId: account.id,
      familyId,
      tokenHash: generateOpaqueToken().tokenHash,
      expiresAt,
      createdAt: now,
    });
    await db
      .insert(refreshToken)
      .values([
        row(new Date(now.getTime() - 86_400_000)),
        row(new Date(now.getTime() - 1)),
        row(new Date(now.getTime() - 2)),
        row(now),
        row(new Date(now.getTime() + 86_400_000)),
      ]);
    expect(await purgeExpiredRefreshTokens(2).run(db, now)).toBe(3);
    const left = await rowsOf(account.id);
    expect(left.map((r) => r.expiresAt.getTime()).sort()).toEqual([
      now.getTime(),
      now.getTime() + 86_400_000,
    ]);
  });
});
