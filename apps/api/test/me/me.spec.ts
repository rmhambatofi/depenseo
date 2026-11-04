// §8.3, NF-FMT-04 : profil du compte connecté, préférences de langue, fuseau IANA et devise.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { user } from '../../src/db/schema/index.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

describe('profil GET/PATCH /me (§8.3, NF-FMT-04)', () => {
  const signupAt = new Date(Date.UTC(2026, 4, 2, 7, 30, 0, 123));
  const clock = new FakeClock(signupAt.getTime());
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const get = (actor: Tenant) =>
    request(http(app)).get('/api/v1/me').set('Authorization', `Bearer ${actor.accessToken}`);
  const patch = (actor: Tenant, body: unknown) =>
    request(http(app))
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(body as object);
  const row = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!;
  const tenant = () => createTenant(app, db, signupAt);

  it('GET renvoie le profil avec les préférences par défaut et les dates de consentement', async () => {
    const alice = await tenant();
    const res = await get(alice);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      id: alice.id,
      email: alice.email,
      language: 'fr',
      timeZone: 'Europe/Paris',
      currency: 'EUR',
      termsAcceptedAt: '2026-05-02T07:30:00.123Z',
      privacyAcceptedAt: '2026-05-02T07:30:00.123Z',
    });
  });

  it('PATCH modifie langue, fuseau et devise, horodate `updated_at` et renvoie le profil', async () => {
    const alice = await tenant();
    clock.advance(60_000);
    const res = await patch(alice, {
      language: 'en',
      timeZone: 'America/Montreal',
      currency: 'CHF',
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      id: alice.id,
      language: 'en',
      timeZone: 'America/Montreal',
      currency: 'CHF',
      termsAcceptedAt: '2026-05-02T07:30:00.123Z',
    });
    const stored = await row(alice.id);
    expect(stored).toMatchObject({
      language: 'en',
      timeZone: 'America/Montreal',
      currency: 'CHF',
    });
    expect(stored.updatedAt).toEqual(clock.now());
    expect((await get(alice)).body).toEqual(res.body);
  });

  it('PATCH partiel : seuls les champs fournis changent', async () => {
    const alice = await tenant();
    const res = await patch(alice, { timeZone: 'Indian/Reunion' });
    expect(res.status).toBe(200);
    expect(await row(alice.id)).toMatchObject({
      language: 'fr',
      timeZone: 'Indian/Reunion',
      currency: 'EUR',
    });
  });

  it.each(['Europe/Lisbon', 'UTC', 'America/Montreal', 'Indian/Reunion'])(
    'accepte le fuseau IANA %s',
    async (timeZone) => {
      const alice = await tenant();
      expect((await patch(alice, { timeZone })).status).toBe(200);
      expect((await row(alice.id)).timeZone).toBe(timeZone);
    },
  );

  it.each([
    ['europe/paris', 'Europe/Paris'],
    ['utc', 'UTC'],
  ])('normalise la casse du fuseau (%s → %s)', async (input, stored) => {
    const alice = await tenant();
    const res = await patch(alice, { timeZone: input });
    expect((res.body as { timeZone: string }).timeZone).toBe(stored);
    expect((await row(alice.id)).timeZone).toBe(stored);
  });

  it('conserve un alias sans le canonicaliser, casse corrigée', async () => {
    const alice = await tenant();
    expect((await patch(alice, { timeZone: 'us/eastern' })).status).toBe(200);
    expect((await row(alice.id)).timeZone).toBe('US/Eastern');
  });

  it.each([
    ['inconnu', 'Mars/Olympus_Mons'],
    ['décalage fixe', '+01:00'],
    ['abréviation', 'CET'],
    ['décalage fixe Etc', 'Etc/GMT+4'],
    ['vide', ''],
    ['espaces', ' Europe/Paris'],
    ['trop long', `Europe/${'a'.repeat(64)}`],
    ['non chaîne', 1],
    ['nul', null],
  ])('fuseau invalide (%s) → 400, compte inchangé', async (_label, timeZone) => {
    const alice = await tenant();
    const before = await row(alice.id);
    const res = await patch(alice, { timeZone });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect((res.body as { detail: string }).detail).toContain('timeZone');
    expect(await row(alice.id)).toEqual(before);
  });

  it.each([
    ['langue non prise en charge', { language: 'de' }, 'language'],
    ['langue nulle', { language: null }, 'language'],
    ['devise nulle', { currency: null }, 'currency'],
    ['devise en minuscules', { currency: 'chf' }, 'currency'],
    ['devise inconnue', { currency: 'BTC' }, 'currency'],
    ['corps vide', {}, '(corps)'],
    ['adresse non modifiable ici', { language: 'en', email: 'autre@example.test' }, '(corps)'],
    ['rôle non modifiable', { language: 'en', role: 'admin' }, '(corps)'],
    [
      'consentement non modifiable',
      { language: 'en', termsAcceptedAt: '2020-01-01T00:00:00.000Z' },
      '(corps)',
    ],
  ])('%s → 400, compte inchangé', async (_label, body, field) => {
    const alice = await tenant();
    const before = await row(alice.id);
    const res = await patch(alice, body);
    expect(res.status).toBe(400);
    expect((res.body as { detail: string }).detail).toContain(field);
    expect(await row(alice.id)).toEqual(before);
  });

  it('sans jeton → 401', async () => {
    expect((await request(http(app)).patch('/api/v1/me').send({ language: 'en' })).status).toBe(
      401,
    );
  });
});
