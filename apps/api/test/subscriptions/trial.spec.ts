// Essai Premium de 14 jours (F-ABO-02, ADR-040) : une fois par compte, jours 1 à 14 inclus dans le
// fuseau du compte, terminé au jour 15 ; droits lus par `GET /subscriptions` et l'export Excel.
// Plage d'horloge : août 2027 (disjointe des autres suites).
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { user } from '../../src/db/schema/index.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

interface Entitlements {
  plan: string;
  premiumUntil: string | null;
  trialEndsAt: string | null;
  trialAvailable: boolean;
}

describe('essai Premium POST /subscriptions/trial (F-ABO-02)', () => {
  // Lundi 2 août 2027, 10:00 à Paris (UTC+2).
  const start = Date.UTC(2027, 7, 2, 8, 0, 0);
  const clock = new FakeClock(start);
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  /** Nouveau jeton à l'instant courant (le jeton d'accès vit 15 min). */
  async function login(t: Tenant): Promise<string> {
    const res = await request(http(app))
      .post('/api/v1/auth/login')
      .send({ email: t.email, password: t.password });
    expect(res.status).toBe(200);
    return (res.body as { accessToken: string }).accessToken;
  }
  const get = (token: string) =>
    request(http(app)).get('/api/v1/subscriptions').set('authorization', `Bearer ${token}`);
  const startTrial = (token: string) =>
    request(http(app)).post('/api/v1/subscriptions/trial').set('authorization', `Bearer ${token}`);

  it('compte neuf : gratuit, essai disponible', async () => {
    clock.set(start);
    const t = await createTenant(app, db, clock.now());
    const res = await get(t.accessToken);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      plan: 'free',
      premiumUntil: null,
      trialEndsAt: null,
      trialAvailable: true,
    } satisfies Entitlements);
  });

  it('essai actif du jour 1 au jour 14 inclus, terminé au jour 15 (minuit à Paris)', async () => {
    clock.set(start);
    const t = await createTenant(app, db, clock.now());
    const started = await startTrial(t.accessToken);
    expect(started.status).toBe(200);
    // Jour 15 = lundi 16 août 2027, 00:00 à Paris = 15 août 22:00 UTC.
    const end = '2027-08-15T22:00:00.000Z';
    expect(started.body).toEqual({
      plan: 'trial',
      premiumUntil: end,
      trialEndsAt: end,
      trialAvailable: false,
    } satisfies Entitlements);
    const [row] = await db.select().from(user).where(eq(user.id, t.id));
    expect(row!.trialEndsAt?.toISOString()).toBe(end);

    // Jour 14, 23:59:59.999 à Paris : encore en essai.
    clock.set(Date.parse(end) - 1);
    expect(((await get(await login(t))).body as Entitlements).plan).toBe('trial');

    // Jour 15, 00:00 à Paris : terminé, sans nouvel essai possible.
    clock.set(Date.parse(end));
    const token = await login(t);
    expect((await get(token)).body).toEqual({
      plan: 'free',
      premiumUntil: null,
      trialEndsAt: end,
      trialAvailable: false,
    } satisfies Entitlements);
    const again = await startTrial(token);
    expect(again.status).toBe(409);
    expect((again.body as { title: string }).title).toBeDefined();
    const [after] = await db.select().from(user).where(eq(user.id, t.id));
    expect(after!.trialEndsAt?.toISOString()).toBe(end);
  });

  it('une seule fois par compte : second essai pendant le premier → 409, fin inchangée', async () => {
    clock.set(start);
    const t = await createTenant(app, db, clock.now());
    expect((await startTrial(t.accessToken)).status).toBe(200);
    clock.set(start + 60_000);
    const again = await startTrial(t.accessToken);
    expect(again.status).toBe(409);
    expect(((await get(t.accessToken)).body as Entitlements).trialEndsAt).toBe(
      '2027-08-15T22:00:00.000Z',
    );
  });

  it('deux demandes simultanées : un seul essai accordé', async () => {
    clock.set(start);
    const t = await createTenant(app, db, clock.now());
    const results = await Promise.all([startTrial(t.accessToken), startTrial(t.accessToken)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('fin calculée dans le fuseau du compte (La Réunion, UTC+4)', async () => {
    clock.set(start);
    const t = await createTenant(app, db, clock.now());
    await db.update(user).set({ timeZone: 'Indian/Reunion' }).where(eq(user.id, t.id));
    const started = await startTrial(t.accessToken);
    // 2 août 12:00 à La Réunion → jour 15 = 16 août 00:00 (+04:00) = 15 août 20:00 UTC.
    expect((started.body as Entitlements).trialEndsAt).toBe('2027-08-15T20:00:00.000Z');
  });

  it('sans jeton → 401', async () => {
    expect((await request(http(app)).get('/api/v1/subscriptions')).status).toBe(401);
    expect((await request(http(app)).post('/api/v1/subscriptions/trial')).status).toBe(401);
  });
});
