// F-ADM-03 : `/admin/*` et `/api/v1/admin/*` répondent 404 — identique à une route inexistante —
// sans rôle administrateur ou sans session admin. Harnais générique sur les routes montées.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminSessionTokens } from '../../src/admin/admin-session-token.js';
import { AccessTokens } from '../../src/auth/session-tokens.js';
import { buildOpenApiDocument } from '../../src/openapi.js';
import { grantAdmin, revokeAdmin } from '../../src/admin/grant-admin.js';
import { user } from '../../src/db/schema/index.js';
import { http, startTestApp, TEST_ENV } from '../support/app.js';
import { createTenant, problemWithoutInstance, type Tenant } from '../support/access.js';
import {
  ADMIN_TOTP_KEY,
  adminLogin,
  codeAt,
  createAdmin,
  mountedRoutes,
  sessionCookie,
  type TestAdmin,
} from '../support/admin.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

const clock = new FakeClock(Date.UTC(2026, 11, 15, 10, 0, 0));
const { pool, db } = testDb();
let app: INestApplication;
let admin: TestAdmin;
let adminTenant: Tenant;
let other: Tenant;
let adminCookie: string;

/** Réponse de référence : une route qui n'existe pas du tout. */
async function notFoundShape(path: string) {
  const res = await request(http(app)).get(path);
  return {
    status: res.status,
    type: res.headers['content-type'],
    body: problemWithoutInstance(res.body),
  };
}

function expectSameAsMissing(
  res: request.Response,
  reference: Awaited<ReturnType<typeof notFoundShape>>,
) {
  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toBe(reference.type);
  expect(problemWithoutInstance(res.body)).toEqual(reference.body);
  expect(res.headers['www-authenticate']).toBeUndefined();
  expect(res.headers['set-cookie']).toBeUndefined();
}

beforeAll(async () => {
  ({ app } = await startTestApp({ clock }));
  admin = await createAdmin(db, clock.now());
  other = await createTenant(app, db, clock.now());
  // Jeton Bearer d'un administrateur : ne doit rien ouvrir côté /admin ni /api/v1/admin.
  const login = await request(http(app))
    .post('/api/v1/auth/login')
    .send({ email: admin.email, password: admin.password });
  adminTenant = { ...admin, accessToken: (login.body as { accessToken: string }).accessToken };
  adminCookie = sessionCookie(await adminLogin(app, admin, codeAt(admin, clock.now())));
});

afterAll(async () => {
  await app.close();
  await pool.promise().end();
});

describe('routes du back-office', () => {
  it('sont toutes sous /admin/api, aucune sous /api/v1/admin, aucune dans l’OpenAPI public', () => {
    const routes = mountedRoutes(app);
    const adminRoutes = routes.filter((r) => r.path.startsWith('/admin'));
    expect(adminRoutes.length).toBeGreaterThan(0);
    expect(adminRoutes.every((r) => r.path.startsWith('/admin/api/'))).toBe(true);
    expect(routes.filter((r) => r.path.startsWith('/api/v1/admin'))).toEqual([]);
    const paths = Object.keys(buildOpenApiDocument(app).paths);
    expect(paths.filter((p) => p.includes('admin'))).toEqual([]);
  });

  it('chaque route admin répond 404 sans session, avec un Bearer ou un cookie forgé', async () => {
    const reference = await notFoundShape('/admin/api/route-inexistante');
    expect(reference.status).toBe(404);
    const forged = await new AccessTokens(TEST_ENV.JWT_ACCESS_SECRET).sign(admin.id, clock.now());
    const wrongKey = await new AdminSessionTokens(TEST_ENV.JWT_ACCESS_SECRET).sign(
      admin.id,
      'enrolement',
      clock.now(),
    );
    const routes = mountedRoutes(app).filter(
      (r) =>
        r.path.startsWith('/admin') && !(r.method === 'post' && r.path === '/admin/api/session'),
    );
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const path = route.path.replace(/:[A-Za-z]+/g, admin.id);
      const call = () => request(http(app))[route.method as 'get'](path);
      expectSameAsMissing(await call(), reference);
      expectSameAsMissing(
        await call().set('Authorization', `Bearer ${adminTenant.accessToken}`),
        reference,
      );
      expectSameAsMissing(await call().set('Cookie', `depenseo_admin=${forged}`), reference);
      expectSameAsMissing(
        await call().set('Cookie', `depenseo_admin=${wrongKey.token}`),
        reference,
      );
      expectSameAsMissing(await call().set('Cookie', 'depenseo_admin=n.importe.quoi'), reference);
    }
  });

  it('/admin, /admin/ et toute page du back-office : 404 pour tous', async () => {
    const reference = await notFoundShape('/admin/route-inexistante');
    for (const path of ['/admin', '/admin/', '/admin/users', '/admin/index.html']) {
      expectSameAsMissing(await request(http(app)).get(path), reference);
      expectSameAsMissing(
        await request(http(app)).get(path).set('Authorization', `Bearer ${other.accessToken}`),
        reference,
      );
    }
  });

  it('/api/v1/admin/* : 404 comme une route inexistante, même pour un administrateur', async () => {
    const reference = await notFoundShape('/api/v1/route-inexistante');
    for (const path of ['/api/v1/admin', '/api/v1/admin/session', '/api/v1/admin/users']) {
      for (const auth of [
        {},
        { Authorization: `Bearer ${adminTenant.accessToken}` },
        { Cookie: adminCookie },
      ]) {
        expectSameAsMissing(await request(http(app)).get(path).set(auth), reference);
      }
    }
  });

  it('une session admin valide ouvre le back-office ; le cookie admin n’est pas un jeton Bearer', async () => {
    const ok = await request(http(app)).get('/admin/api/session').set('Cookie', adminCookie);
    expect(ok.status).toBe(200);
    const asBearer = await request(http(app))
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${adminCookie.split('=')[1]}`);
    expect(asBearer.status).toBe(401);
  });

  it('un compte non administrateur ne peut pas ouvrir de session, même avec un code au bon format', async () => {
    const reference = await notFoundShape('/admin/api/route-inexistante');
    const res = await adminLogin(app, other, '123456');
    expect(res.status).toBe(404);
    expect(problemWithoutInstance(res.body)).toEqual(reference.body);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('retrait du rôle : la session en cours répond 404 dès la requête suivante', async () => {
    const victim = await createAdmin(db, clock.now());
    const cookie = sessionCookie(await adminLogin(app, victim, codeAt(victim, clock.now())));
    expect((await request(http(app)).get('/admin/api/session').set('Cookie', cookie)).status).toBe(
      200,
    );
    // Rôle seul retiré en base (secret conservé) : le rôle est bien relu à chaque requête.
    await db.update(user).set({ role: 'user' }).where(eq(user.id, victim.id));
    expect((await request(http(app)).get('/admin/api/session').set('Cookie', cookie)).status).toBe(
      404,
    );
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, victim.id));
    expect((await request(http(app)).get('/admin/api/session').set('Cookie', cookie)).status).toBe(
      200,
    );
    // Réattribution (nouveau secret, ex. téléphone perdu) : l'ancienne session est caduque.
    await grantAdmin(db, ADMIN_TOTP_KEY, victim.email, clock.now());
    expect((await request(http(app)).get('/admin/api/session').set('Cookie', cookie)).status).toBe(
      404,
    );
    await revokeAdmin(db, victim.email, clock.now());
    expect((await request(http(app)).get('/admin/api/session').set('Cookie', cookie)).status).toBe(
      404,
    );
  });
});
