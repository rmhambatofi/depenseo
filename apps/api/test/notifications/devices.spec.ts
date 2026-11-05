// Routes de compte des notifications (F-NOT-01, F-NOT-04, ADR-035) : enregistrement d'appareils
// (idempotent, jeton déplacé, identifiant d'un autre compte refusé), désinscription limitée au
// compte, réglages par type et plage de silence. Isolation entre comptes (NF-SEC-03) : ces routes
// sont classées à part dans `test/access/cross-tenant.spec.ts` et éprouvées ici.
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { device } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

describe('appareils et réglages de notification', () => {
  const now = new Date(Date.UTC(2026, 5, 15, 8, 0, 0));
  const clock = new FakeClock(now.getTime());
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
  });
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const tenant = () => createTenant(app, db, now);
  const auth = (t: Tenant) => ({ Authorization: `Bearer ${t.accessToken}` });
  const put = (t: Tenant, id: string, body: unknown) =>
    request(http(app))
      .put(`/api/v1/me/devices/${id}`)
      .set(auth(t))
      .send(body as object);
  const del = (t: Tenant, id: string) =>
    request(http(app)).delete(`/api/v1/me/devices/${id}`).set(auth(t));
  const getSettings = (t: Tenant) =>
    request(http(app)).get('/api/v1/me/notification-settings').set(auth(t));
  const patchSettings = (t: Tenant, body: unknown) =>
    request(http(app))
      .patch('/api/v1/me/notification-settings')
      .set(auth(t))
      .send(body as object);
  const devicesOf = (userId: string) =>
    db
      .select({ id: device.id, platform: device.platform, token: device.pushToken })
      .from(device)
      .where(eq(device.userId, userId));
  const token = () => `tok-${newId()}`;

  describe('PUT /me/devices/{deviceId}', () => {
    it('enregistre puis met à jour (idempotent, 204)', async () => {
      const a = await tenant();
      const id = newId();
      const first = token();
      expect((await put(a, id, { platform: 'ios', token: first })).status).toBe(204);
      expect((await put(a, id, { platform: 'ios', token: first })).status).toBe(204);
      expect(await devicesOf(a.id)).toEqual([{ id, platform: 'ios', token: first }]);
      const renewed = token();
      expect((await put(a, id, { platform: 'ios', token: renewed })).status).toBe(204);
      expect(await devicesOf(a.id)).toEqual([{ id, platform: 'ios', token: renewed }]);
    });

    it('jeton déjà enregistré par un autre compte : déplacé vers le nouveau compte', async () => {
      const a = await tenant();
      const b = await tenant();
      const shared = token();
      await put(a, newId(), { platform: 'android', token: shared });
      const id = newId();
      expect((await put(b, id, { platform: 'android', token: shared })).status).toBe(204);
      expect(await devicesOf(a.id)).toEqual([]);
      expect(await devicesOf(b.id)).toEqual([{ id, platform: 'android', token: shared }]);
    });

    it('jetons distincts par la casse seulement : deux appareils', async () => {
      const a = await tenant();
      const lower = `abc${newId()}`;
      await put(a, newId(), { platform: 'android', token: lower });
      await put(a, newId(), { platform: 'android', token: lower.toUpperCase() });
      expect(await devicesOf(a.id)).toHaveLength(2);
    });

    it('identifiant d’un appareil d’un autre compte → 409, rien de modifié', async () => {
      const a = await tenant();
      const b = await tenant();
      const id = newId();
      const own = token();
      await put(a, id, { platform: 'ios', token: own });
      const res = await put(b, id, { platform: 'android', token: token() });
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain(a.id);
      expect(await devicesOf(a.id)).toEqual([{ id, platform: 'ios', token: own }]);
      expect(await devicesOf(b.id)).toEqual([]);
    });

    it.each([
      ['identifiant non v7', 'not-a-uuid', { platform: 'ios', token: 'x' }],
      ['UUID v4', '3b241101-e2bb-4255-8caf-4136c566a962', { platform: 'ios', token: 'x' }],
      ['plateforme inconnue', null, { platform: 'web', token: 'x' }],
      ['jeton vide', null, { platform: 'ios', token: '' }],
      ['jeton avec espace', null, { platform: 'ios', token: 'a b' }],
      ['jeton trop long', null, { platform: 'ios', token: 'a'.repeat(513) }],
      ['champ inconnu', null, { platform: 'ios', token: 'x', name: 'iPhone' }],
    ])('%s → 400', async (_label, id, body) => {
      const a = await tenant();
      const res = await put(a, id ?? newId(), body);
      expect(res.status).toBe(400);
      expect(await devicesOf(a.id)).toEqual([]);
    });

    it('sans jeton d’accès → 401', async () => {
      const res = await request(http(app))
        .put(`/api/v1/me/devices/${newId()}`)
        .send({ platform: 'ios', token: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /me/devices/{deviceId}', () => {
    it('désinscrit son appareil ; inconnu ou invalide → 204', async () => {
      const a = await tenant();
      const id = newId();
      await put(a, id, { platform: 'ios', token: token() });
      expect((await del(a, id)).status).toBe(204);
      expect(await devicesOf(a.id)).toEqual([]);
      expect((await del(a, id)).status).toBe(204);
      expect((await del(a, 'nope')).status).toBe(204);
    });

    it('l’appareil d’un autre compte reste enregistré', async () => {
      const a = await tenant();
      const b = await tenant();
      const id = newId();
      await put(a, id, { platform: 'ios', token: token() });
      expect((await del(b, id)).status).toBe(204);
      expect(await devicesOf(a.id)).toHaveLength(1);
    });
  });

  describe('/me/notification-settings', () => {
    const DEFAULTS = {
      limit: true,
      occurrence: true,
      unusualExpense: true,
      dailyReminder: true,
      quietHours: null,
    };

    it('valeurs par défaut : tout activé, aucune plage', async () => {
      const a = await tenant();
      const res = await getSettings(a);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual(DEFAULTS);
    });

    it('PATCH partiel, cumulatif, plage à cheval sur minuit puis retirée', async () => {
      const a = await tenant();
      let res = await patchSettings(a, { limit: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...DEFAULTS, limit: false });
      res = await patchSettings(a, { quietHours: { start: '22:00', end: '07:00' } });
      expect(res.body).toEqual({
        ...DEFAULTS,
        limit: false,
        quietHours: { start: '22:00', end: '07:00' },
      });
      expect((await getSettings(a)).body).toEqual(res.body);
      res = await patchSettings(a, { quietHours: null, dailyReminder: false });
      expect(res.body).toEqual({ ...DEFAULTS, limit: false, dailyReminder: false });
    });

    it('réglages propres à chaque compte', async () => {
      const a = await tenant();
      const b = await tenant();
      await patchSettings(a, { occurrence: false, quietHours: { start: '12:00', end: '14:00' } });
      expect((await getSettings(b)).body).toEqual(DEFAULTS);
      await patchSettings(b, { unusualExpense: false });
      expect((await getSettings(a)).body).toEqual({
        ...DEFAULTS,
        occurrence: false,
        quietHours: { start: '12:00', end: '14:00' },
      });
    });

    it.each([
      ['corps vide', {}],
      ['champ inconnu', { limit: true, sound: false }],
      ['booléen en chaîne', { limit: 'false' }],
      ['heure invalide', { quietHours: { start: '24:00', end: '07:00' } }],
      ['début = fin', { quietHours: { start: '07:00', end: '07:00' } }],
      ['fin manquante', { quietHours: { start: '22:00' } }],
    ])('%s → 400', async (_label, body) => {
      const a = await tenant();
      expect((await patchSettings(a, body)).status).toBe(400);
      expect((await getSettings(a)).body).toEqual(DEFAULTS);
    });
  });
});
