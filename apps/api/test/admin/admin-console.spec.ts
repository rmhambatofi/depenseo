// Application du back-office (§8.5, F-ADM-01/03, ADR-044) : seule la page de connexion est
// publique ; les fichiers de l'application React-admin ne sont servis qu'à une session admin, et
// répondent sinon exactement comme une route inexistante.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAdminConsole } from '../../src/admin/admin-console.js';
import { loadConfig } from '../../src/config/env.js';
import { http, startTestApp, TEST_ENV } from '../support/app.js';
import { createTenant, problemWithoutInstance, type Tenant } from '../support/access.js';
import {
  ADMIN_DIST_FIXTURE,
  adminLogin,
  auditOf,
  codeAt,
  createAdmin,
  sessionCookie,
  type TestAdmin,
} from '../support/admin.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

const clock = new FakeClock(Date.UTC(2029, 5, 12, 9, 0, 0));
const { pool, db } = testDb();
let app: INestApplication;
let admin: TestAdmin;
let other: Tenant;
let cookie: string;

const get = (path: string) => request(http(app)).get(path);

async function expectMissing(res: request.Response) {
  const reference = await get('/admin/route-inexistante');
  expect(reference.status).toBe(404);
  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toBe(reference.headers['content-type']);
  expect(problemWithoutInstance(res.body)).toEqual(problemWithoutInstance(reference.body));
  // Le champ `instance` reprend l'URL : on vérifie le contenu servi, pas le nom du fichier.
  expect(res.text).not.toMatch(/fixture-(login|admin)/);
}

beforeAll(async () => {
  ({ app } = await startTestApp({ clock, env: { ADMIN_DIST_DIR: ADMIN_DIST_FIXTURE } }));
  admin = await createAdmin(db, clock.now());
  other = await createTenant(app, db, clock.now());
  cookie = sessionCookie(await adminLogin(app, admin, codeAt(admin, clock.now())));
});

afterAll(async () => {
  await app.close();
  await pool.promise().end();
});

describe('page de connexion (publique)', () => {
  it('est servie à tous, sans cache, avec des en-têtes de sécurité', async () => {
    for (const path of ['/admin/login', '/admin/login/']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(res.text).toContain('fixture-login-page');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('ses fichiers sont publics, mais seulement les siens', async () => {
    const script = await get('/admin/login/assets/login-fixture.js');
    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.text).toContain('fixture-login-script');
    // Un fichier de l'application admin n'est jamais servi depuis le dossier public, même à un admin.
    await expectMissing(await get('/admin/login/assets/app-fixture.js'));
    await expectMissing(await get('/admin/login/assets/app-fixture.js').set('Cookie', cookie));
    await expectMissing(await get('/admin/login/index.html'));
  });

  it('ne laisse pas remonter hors du dossier', async () => {
    for (const path of [
      '/admin/login/assets/..%2F..%2Fapp%2Findex.html',
      '/admin/login/assets/%2e%2e%2findex.html',
      '/admin/login/assets/..%5Cindex.html',
    ]) {
      await expectMissing(await get(path));
    }
  });
});

describe('application admin (session admin seulement)', () => {
  it('404 comme une route inexistante sans session, avec un Bearer ou un cookie forgé', async () => {
    for (const path of [
      '/admin',
      '/admin/',
      '/admin/assets/app-fixture.js',
      '/admin/assets/app-fixture.js/',
      // Express ignore la casse des routes : les variantes ne doivent rien trahir (pas de 401).
      '/ADMIN',
      '/Admin/',
      '/ADMIN/assets/app-fixture.js',
    ]) {
      await expectMissing(await get(path));
      await expectMissing(await get(path).set('Authorization', `Bearer ${other.accessToken}`));
      await expectMissing(await get(path).set('Cookie', 'depenseo_admin=n.importe.quoi'));
    }
  });

  it('HEAD sans session : 404 aussi', async () => {
    for (const path of ['/admin/', '/admin/assets/app-fixture.js', '/ADMIN/']) {
      const res = await request(http(app)).head(path);
      expect(res.status).toBe(404);
      expect(res.headers['www-authenticate']).toBeUndefined();
    }
  });

  it('est servie à une session admin, sans cache, et chaque accès est tracé', async () => {
    for (const path of ['/admin', '/admin/']) {
      const res = await get(path).set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(res.text).toContain('fixture-admin-app');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    }
    const script = await get('/admin/assets/app-fixture.js').set('Cookie', cookie);
    expect(script.status).toBe(200);
    expect(script.text).toContain('fixture-admin-script');
    expect(script.headers['cache-control']).toBe('no-store');
    const style = await get('/admin/assets/app-fixture.css').set('Cookie', cookie);
    expect(style.headers['content-type']).toBe('text/css; charset=utf-8');
    const routes = (await auditOf(db, admin.id, 'admin.access')).map((row) => row.route);
    expect(routes).toEqual(expect.arrayContaining(['GET /admin', 'GET /admin/assets/:file']));
  });

  it('ne sert que les fichiers du build, jamais la page de connexion ni un chemin remonté', async () => {
    for (const path of [
      '/admin/assets/inexistant.js',
      '/admin/assets/login-fixture.js',
      '/admin/assets/..%2Findex.html',
      '/admin/assets/..%2F..%2Flogin%2Findex.html',
      '/admin/index.html',
      '/admin/users',
    ]) {
      await expectMissing(await get(path).set('Cookie', cookie));
    }
  });
});

describe('sans build configuré', () => {
  it('la page de connexion et l’application répondent 404', async () => {
    const { app: bare } = await startTestApp({ clock });
    try {
      const bareCookie = sessionCookie(
        await adminLogin(bare, admin, codeAt(admin, clock.now(), 1)),
      );
      for (const [path, auth] of [
        ['/admin/login', undefined],
        ['/admin/login/assets/login-fixture.js', undefined],
        ['/admin/', bareCookie],
      ] as const) {
        const call = request(http(bare)).get(path);
        const res = await (auth ? call.set('Cookie', auth) : call);
        expect(res.status).toBe(404);
      }
    } finally {
      await bare.close();
    }
  });

  it('un dossier de build absent ou incomplet empêche le démarrage', () => {
    // Appelé par la fabrique du module : Nest interrompt alors le démarrage.
    expect(() => loadAdminConsole('/nexiste/pas')).toThrow(/ADMIN_DIST_DIR/);
    expect(() => loadAdminConsole(`${ADMIN_DIST_FIXTURE}/app`)).toThrow(/ADMIN_DIST_DIR/);
    expect(() => loadConfig({ ...TEST_ENV, ADMIN_DIST_DIR: 'apps/admin/dist' })).toThrow(
      /ADMIN_DIST_DIR/,
    );
  });
});
