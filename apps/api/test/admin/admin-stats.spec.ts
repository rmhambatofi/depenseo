// Statistiques agrégées du back-office (F-ADM-01, ADR-043) : compteurs seulement, aucun montant.
// Suite en avril 2029 : aucune autre suite n'y crée de compte, d'essai ni d'abonnement actif, d'où
// des assertions exactes sur ce qui dépend de la date (inscriptions, Premium, essais).
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminStats } from '../../src/admin/admin-ops.service.js';
import { user } from '../../src/db/schema/index.js';
import { http, startTestApp } from '../support/app.js';
import { adminLogin, codeAt, createAdmin, sessionCookie } from '../support/admin.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { insertSubscription } from '../support/subscriptions.js';
import { createUser } from '../support/users.js';

const DAY = 86_400_000;
const clock = new FakeClock(Date.UTC(2029, 3, 10, 23, 30, 0));
const { pool, db } = testDb();
let app: INestApplication;
let stats: AdminStats;

beforeAll(async () => {
  ({ app } = await startTestApp({ clock }));
  // 10 avril (UTC) : un compte vérifié, un non vérifié.
  const premium = await createUser(db, clock.now());
  const trialOnly = await createUser(db, clock.now(), { verified: false });
  clock.set(Date.UTC(2029, 3, 12, 8, 0, 0));
  // 12 avril : l'administrateur et un compte en essai qui a aussi un abonnement actif.
  const admin = await createAdmin(db, clock.now());
  const both = await createUser(db, clock.now());
  const now = clock.now();
  await insertSubscription(db, premium.id, now, { expiresAt: new Date(now.getTime() + 20 * DAY) });
  await insertSubscription(db, both.id, now, { expiresAt: new Date(now.getTime() + 20 * DAY) });
  await insertSubscription(db, premium.id, now, { expiresAt: now, status: 'expired' });
  const trialEndsAt = new Date(now.getTime() + 5 * DAY);
  await db.update(user).set({ trialEndsAt }).where(eq(user.id, trialOnly.id));
  await db.update(user).set({ trialEndsAt }).where(eq(user.id, both.id));
  const cookie = sessionCookie(await adminLogin(app, admin, codeAt(admin, now)));
  const res = await request(http(app)).get('/admin/api/stats').set('Cookie', cookie);
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('no-store');
  stats = res.body as AdminStats;
});

afterAll(async () => {
  await app.close();
  await pool.promise().end();
});

describe('GET /admin/api/stats', () => {
  it('inscriptions par jour UTC sur 30 jours, du plus ancien au plus récent', () => {
    expect(stats.generatedAt).toBe('2029-04-12T08:00:00.000Z');
    expect(stats.signups).toHaveLength(30);
    expect(stats.signups[0]!.date).toBe('2029-03-14');
    expect(stats.signups.at(-1)!.date).toBe('2029-04-12');
    expect(stats.signups.filter((d) => d.count > 0)).toEqual([
      { date: '2029-04-10', count: 2 },
      { date: '2029-04-12', count: 2 },
    ]);
  });

  it('Premium = comptes distincts à abonnement actif ; essai = en cours sans abonnement', () => {
    expect(stats.plans).toEqual({ premium: 2, trial: 1 });
    expect(stats.subscriptions.byStore).toEqual({ google_play: 2 });
    expect(stats.subscriptions.byStatus.expired).toBeGreaterThanOrEqual(1);
  });

  it('totaux cohérents et aucune somme ni montant', () => {
    expect(stats.users.total).toBeGreaterThanOrEqual(4);
    expect(stats.users.verified).toBeGreaterThanOrEqual(3);
    expect(stats.users.verified).toBeLessThan(stats.users.total);
    expect(stats.users.admins).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(stats.expenses.total)).toBe(true);
    expect(stats.expenses.createdLast30Days).toBe(0);
    expect(Object.keys(stats).sort()).toEqual(
      ['expenses', 'generatedAt', 'jobs', 'plans', 'signups', 'subscriptions', 'users'].sort(),
    );
    expect(JSON.stringify(stats)).not.toMatch(/amount|sum/i);
  });
});
