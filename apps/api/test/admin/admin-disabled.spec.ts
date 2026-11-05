// ADR-042 : sans ADMIN_SESSION_SECRET ni ADMIN_TOTP_KEY, le back-office est désactivé (404 partout),
// même pour un administrateur aux identifiants et au code valides.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { problemWithoutInstance } from '../support/access.js';
import { adminLogin, codeAt, createAdmin, type TestAdmin } from '../support/admin.js';
import { http, startTestApp, TEST_ENV } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

const clock = new FakeClock(Date.UTC(2026, 11, 18, 10, 0, 0));
const { pool, db } = testDb();
let app: INestApplication;
let admin: TestAdmin;

beforeAll(async () => {
  ({ app } = await startTestApp({
    clock,
    env: { ADMIN_SESSION_SECRET: undefined, ADMIN_TOTP_KEY: undefined },
  }));
  admin = await createAdmin(db, clock.now());
});

afterAll(async () => {
  await app.close();
  await pool.promise().end();
});

describe('back-office non configuré', () => {
  it('connexion et session répondent 404 comme une route inexistante', async () => {
    const missing = await request(http(app)).get('/admin/api/route-inexistante');
    const login = await adminLogin(app, admin, codeAt(admin, clock.now()));
    expect(login.status).toBe(404);
    expect(login.headers['set-cookie']).toBeUndefined();
    expect(problemWithoutInstance(login.body)).toEqual(problemWithoutInstance(missing.body));
    expect((await request(http(app)).get('/admin/api/session')).status).toBe(404);
  });
});

describe('configuration', () => {
  it('ADMIN_SESSION_SECRET et ADMIN_TOTP_KEY vont ensemble', () => {
    expect(() => loadConfig({ ...TEST_ENV, ADMIN_TOTP_KEY: undefined })).toThrow(
      /ADMIN_TOTP_KEY : absente/,
    );
  });

  it('ADMIN_SESSION_SECRET doit différer de JWT_ACCESS_SECRET', () => {
    expect(() =>
      loadConfig({ ...TEST_ENV, ADMIN_SESSION_SECRET: TEST_ENV.JWT_ACCESS_SECRET }),
    ).toThrow(/ADMIN_SESSION_SECRET : identique/);
  });
});
