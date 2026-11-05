// F-ADM-01, NF-SEC-06 : connexion admin avec TOTP, cookie de session, journal d'audit.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_MAX_FAILURES } from '../../src/admin/admin-login.service.js';
import { user } from '../../src/db/schema/index.js';
import { http, startTestApp } from '../support/app.js';
import {
  adminLogin,
  auditOf,
  codeAt,
  createAdmin,
  sessionCookie,
  type TestAdmin,
} from '../support/admin.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

const MINUTE = 60_000;
const clock = new FakeClock(Date.UTC(2026, 11, 16, 10, 0, 0));
const { pool, db } = testDb();
let app: INestApplication;

const getSession = (cookie: string) =>
  request(http(app)).get('/admin/api/session').set('Cookie', cookie);

beforeAll(async () => {
  ({ app } = await startTestApp({ clock }));
});

afterAll(async () => {
  await app.close();
  await pool.promise().end();
});

describe('POST /admin/api/session', () => {
  it('ouvre une session : cookie HttpOnly; Secure; SameSite=Strict; Path=/admin de 30 min, audité', async () => {
    const admin = await createAdmin(db, clock.now());
    const res = await adminLogin(app, admin, codeAt(admin, clock.now()));
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    const [cookie] = res.headers['set-cookie'] as unknown as string[];
    const attributes = cookie!
      .split(/;\s*/)
      .slice(1)
      .map((a) => a.toLowerCase());
    expect(attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'secure',
        'samesite=strict',
        'path=/admin',
        'max-age=1800',
      ]),
    );
    expect(attributes.some((a) => a.startsWith('domain='))).toBe(false);
    expect((await auditOf(db, admin.id)).map((a) => a.action)).toEqual(['admin.login']);

    const current = await getSession(sessionCookie(res));
    expect(current.status).toBe(200);
    expect(current.body).toEqual({
      userId: admin.id,
      expiresAt: new Date(clock.now().getTime() + 30 * MINUTE).toISOString(),
    });
  });

  it('accepte le code du pas précédent ou suivant (dérive d’horloge), pas au-delà', async () => {
    const admin = await createAdmin(db, clock.now());
    expect((await adminLogin(app, admin, codeAt(admin, clock.now(), -2))).status).toBe(404);
    expect((await adminLogin(app, admin, codeAt(admin, clock.now(), 2))).status).toBe(404);
    expect((await adminLogin(app, admin, codeAt(admin, clock.now(), -1))).status).toBe(204);
    expect((await adminLogin(app, admin, codeAt(admin, clock.now(), 1))).status).toBe(204);
  });

  it('refuse le rejeu d’un code déjà utilisé, ou d’un code plus ancien', async () => {
    const admin = await createAdmin(db, clock.now());
    const code = codeAt(admin, clock.now());
    expect((await adminLogin(app, admin, code)).status).toBe(204);
    expect((await adminLogin(app, admin, code)).status).toBe(404);
    expect((await adminLogin(app, admin, codeAt(admin, clock.now(), -1))).status).toBe(404);
    expect((await auditOf(db, admin.id)).map((a) => a.action)).toEqual([
      'admin.login',
      'admin.login_failed',
      'admin.login_failed',
    ]);
  });

  it('mot de passe faux, corps invalide, code absent : 404 sans cookie', async () => {
    const admin = await createAdmin(db, clock.now());
    const code = codeAt(admin, clock.now());
    const cases = [
      { email: admin.email, password: 'mauvais mot de passe', code },
      { email: admin.email, password: admin.password },
      { email: admin.email, password: admin.password, code, extra: 1 },
      { email: admin.email, password: admin.password, code: Number(code) },
      'texte',
    ];
    for (const body of cases) {
      const res = await request(http(app)).post('/admin/api/session').send(body);
      expect(res.status).toBe(404);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    // Mot de passe faux : rien à attribuer à l'administrateur (pas de trace, pas de blocage).
    expect(await auditOf(db, admin.id)).toEqual([]);
  });

  it(`bloque après ${ADMIN_MAX_FAILURES} codes faux en 15 min, même avec le bon code`, async () => {
    const admin = await createAdmin(db, clock.now());
    for (let i = 0; i < ADMIN_MAX_FAILURES; i++) {
      expect((await adminLogin(app, admin, '000000')).status).toBe(404);
    }
    expect((await adminLogin(app, admin, codeAt(admin, clock.now()))).status).toBe(404);
    expect((await auditOf(db, admin.id, 'admin.login_blocked')).length).toBe(1);
    clock.advance(15 * MINUTE + 1000);
    try {
      expect((await adminLogin(app, admin, codeAt(admin, clock.now()))).status).toBe(204);
    } finally {
      clock.advance(-(15 * MINUTE + 1000));
    }
  });

  it('secret TOTP indéchiffrable (autre clé, autre compte) : 404', async () => {
    const a = await createAdmin(db, clock.now());
    const b = await createAdmin(db, clock.now());
    const [row] = await db
      .select({ secret: user.adminTotpSecret })
      .from(user)
      .where(eq(user.id, a.id));
    // Secret de A recopié sur B : les données associées (id du compte) ne collent plus.
    await db.update(user).set({ adminTotpSecret: row!.secret }).where(eq(user.id, b.id));
    expect((await adminLogin(app, b, codeAt(a, clock.now()))).status).toBe(404);
    expect(row!.secret).not.toContain(a.totpSecret);
  });
});

describe('session admin', () => {
  let admin: TestAdmin;
  let cookie: string;

  beforeAll(async () => {
    admin = await createAdmin(db, clock.now());
    cookie = sessionCookie(await adminLogin(app, admin, codeAt(admin, clock.now())));
  });

  it('chaque accès est audité avec la route, sans paramètre de requête', async () => {
    const before = (await auditOf(db, admin.id, 'admin.access')).length;
    expect((await getSession(cookie)).status).toBe(200);
    expect(
      (await request(http(app)).get('/admin/api/session?x=secret').set('Cookie', cookie)).status,
    ).toBe(200);
    const after = await auditOf(db, admin.id, 'admin.access');
    expect(after.length).toBe(before + 2);
    expect(after.slice(-2).map((a) => a.route)).toEqual([
      'GET /admin/api/session',
      'GET /admin/api/session',
    ]);
  });

  it('un accès refusé (sans session) n’écrit rien au nom de l’administrateur', async () => {
    const before = (await auditOf(db, admin.id)).length;
    expect((await request(http(app)).get('/admin/api/session')).status).toBe(404);
    expect((await auditOf(db, admin.id)).length).toBe(before);
  });

  it('expire après 30 min (durée absolue)', async () => {
    clock.advance(30 * MINUTE - 1000);
    try {
      expect((await getSession(cookie)).status).toBe(200);
      clock.advance(1000);
      expect((await getSession(cookie)).status).toBe(404);
    } finally {
      clock.advance(-30 * MINUTE);
    }
  });

  it('déconnexion : efface le cookie sur le même chemin, auditée', async () => {
    const res = await request(http(app)).delete('/admin/api/session').set('Cookie', cookie);
    expect(res.status).toBe(204);
    const [cleared] = res.headers['set-cookie'] as unknown as string[];
    expect(cleared).toMatch(/^depenseo_admin=;/);
    expect(cleared!.toLowerCase()).toContain('path=/admin');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    const routes = (await auditOf(db, admin.id, 'admin.access')).map((a) => a.route);
    expect(routes).toContain('DELETE /admin/api/session');
  });
});
