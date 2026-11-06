// Routes du back-office (F-ADM-01, NF-SEC-06, ADR-043) : comptes sans montants, abonnements, tâches
// en échec et relance, journal d'audit. Le 404 sans session est couvert par `admin-access.spec.ts`
// (toutes les routes montées). Suite en mars 2028 (plage propre).
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, category, expense, job, user, userIdentity } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { http, startTestApp } from '../support/app.js';
import {
  adminLogin,
  codeAt,
  createAdmin,
  sessionCookie,
  type TestAdmin,
} from '../support/admin.js';
import { FakeClock } from '../support/clock.js';
import { testDb, testJob } from '../support/jobs.js';
import { insertSubscription } from '../support/subscriptions.js';
import { createUser, type TestUser } from '../support/users.js';

const clock = new FakeClock(Date.UTC(2028, 2, 10, 9, 0, 0));
const { pool, db } = testDb();
const run = newId().slice(-12);
const jobType = testJob().type;
let app: INestApplication;
let admin: TestAdmin;
let cookie: string;
const accounts: TestUser[] = [];
const jobIds: string[] = [];

const get = (path: string) => request(http(app)).get(path).set('Cookie', cookie);
const post = (path: string) => request(http(app)).post(path).set('Cookie', cookie);

async function insertJob(status: 'failed' | 'done' | 'pending') {
  const id = newId();
  const now = clock.now();
  await db.insert(job).values({
    id,
    type: jobType,
    payload: '{}',
    status,
    runAt: now,
    attempts: status === 'failed' ? 5 : 0,
    lastError: status === 'failed' ? 'handler_timeout' : null,
    finishedAt: status === 'pending' ? null : now,
    createdAt: now,
    updatedAt: now,
  });
  jobIds.push(id);
  return id;
}

beforeAll(async () => {
  ({ app } = await startTestApp({ clock }));
  admin = await createAdmin(db, clock.now());
  cookie = sessionCookie(await adminLogin(app, admin, codeAt(admin, clock.now())));
  for (const [i, verified] of [true, false, true].entries()) {
    clock.advance(1000);
    const account = await createUser(db, clock.now(), { verified });
    const email = `p504-${run}-${i}@example.test`;
    await db.update(user).set({ email }).where(eq(user.id, account.id));
    accounts.push({ ...account, email });
  }
});

afterAll(async () => {
  await db.delete(job).where(inArray(job.id, jobIds));
  await app.close();
  await pool.promise().end();
});

describe('GET /admin/api/users', () => {
  it('liste les comptes du plus récent au plus ancien, filtre par fragment d’e-mail, pagine', async () => {
    const first = await get(`/admin/api/users?q=P504-${run}&limit=2`);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const body = first.body as { items: { id: string }[]; nextCursor: string | null };
    expect(body.items).toEqual([
      {
        id: accounts[2]!.id,
        email: accounts[2]!.email,
        emailVerified: true,
        role: 'user',
        createdAt: expect.any(String) as string,
      },
      expect.objectContaining({ id: accounts[1]!.id, emailVerified: false }),
    ]);
    const next = await get(
      `/admin/api/users?q=p504-${run}&limit=2&cursor=${body.nextCursor ?? ''}`,
    );
    expect((next.body as typeof body).items.map((u) => u.id)).toEqual([accounts[0]!.id]);
    expect((next.body as typeof body).nextCursor).toBeNull();
  });

  it('départage par identifiant décroissant deux comptes créés au même instant', async () => {
    const twins = [await createUser(db, clock.now()), await createUser(db, clock.now())];
    for (const [i, twin] of twins.entries()) {
      await db
        .update(user)
        .set({ email: `twin-${run}-${i}@example.test` })
        .where(eq(user.id, twin.id));
    }
    const expected = twins
      .map((t) => t.id)
      .sort()
      .reverse();
    const first = (await get(`/admin/api/users?q=twin-${run}&limit=1`)).body as {
      items: { id: string }[];
      nextCursor: string;
    };
    const second = (await get(`/admin/api/users?q=twin-${run}&limit=1&cursor=${first.nextCursor}`))
      .body as typeof first;
    expect([...first.items, ...second.items].map((u) => u.id)).toEqual(expected);
    expect(second.nextCursor).toBeNull();
  });

  it('échappe les jokers LIKE et refuse les paramètres invalides', async () => {
    const wildcard = await get(`/admin/api/users?q=p504_${run}`);
    expect((wildcard.body as { items: unknown[] }).items).toEqual([]);
    for (const q of ['limit=0', 'limit=101', 'cursor=zzz', 'role=admin']) {
      expect((await get(`/admin/api/users?${q}`)).status).toBe(400);
    }
  });
});

describe('GET /admin/api/users/:userId', () => {
  it('fiche sans montant ni secret, et trace la consultation avec le compte visé', async () => {
    const account = accounts[0]!;
    const now = clock.now();
    await insertSubscription(db, account.id, now, {
      expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    });
    await db.insert(userIdentity).values({
      id: newId(),
      userId: account.id,
      provider: 'google',
      subjectHash: Buffer.alloc(32, 7),
      createdAt: now,
    });
    const res = await get(`/admin/api/users/${account.id.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: account.id,
      email: account.email,
      emailVerified: true,
      role: 'user',
      createdAt: expect.any(String) as string,
      language: 'fr',
      timeZone: 'Europe/Paris',
      currency: 'EUR',
      hasPassword: true,
      providers: ['google'],
      devices: { ios: 0, android: 0 },
      notebooks: 1,
      expenses: 0,
      plan: 'premium',
      premiumUntil: expect.any(String) as string,
      trialEndsAt: null,
      subscriptions: [
        expect.objectContaining({ userId: account.id, store: 'google_play', status: 'active' }),
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|secret|amount|"password/i);
    const views = await db
      .select({ targetType: auditLog.targetType })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, admin.id),
          eq(auditLog.action, 'admin.user_view'),
          eq(auditLog.targetId, account.id),
        ),
      );
    expect(views).toEqual([{ targetType: 'user' }]);
  });

  it('compte inconnu ou identifiant mal formé → 404', async () => {
    expect((await get(`/admin/api/users/${newId()}`)).status).toBe(404);
    expect((await get('/admin/api/users/pas-un-uuid')).status).toBe(404);
  });

  it('ne compte que les dépenses non supprimées, sans exposer leur montant', async () => {
    const account = accounts[1]!;
    const now = clock.now();
    const [anyCategory] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.notebookId, account.notebookId))
      .limit(1);
    for (const deletedAt of [null, null, now]) {
      await db.insert(expense).values({
        id: newId(),
        notebookId: account.notebookId,
        amount: 987_654,
        currency: 'EUR',
        categoryId: anyCategory!.id,
        spentOn: '2028-03-09',
        createdAt: now,
        updatedAt: now,
        deletedAt,
      });
    }
    const res = await get(`/admin/api/users/${account.id}`);
    expect((res.body as { expenses: number }).expenses).toBe(2);
    // Montant entier ou formaté ; pas « 987 » seul, présent par hasard dans
    // les UUID aléatoires de la réponse (échec CI du 2026-11-06).
    expect(JSON.stringify(res.body)).not.toMatch(/987654|9876[.,]54/);
  });
});

describe('GET /admin/api/subscriptions', () => {
  it('filtre par compte et statut, sans empreinte d’achat', async () => {
    const account = accounts[2]!;
    const now = clock.now();
    await insertSubscription(db, account.id, now, { expiresAt: now, status: 'expired' });
    const res = await get(`/admin/api/subscriptions?userId=${account.id}&status=expired`);
    expect(res.status).toBe(200);
    const items = (res.body as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'productCode',
      'status',
      'store',
      'userId',
      'verifiedAt',
    ]);
    const none = await get(`/admin/api/subscriptions?userId=${account.id}&status=active`);
    expect((none.body as { items: unknown[] }).items).toEqual([]);
    expect((await get('/admin/api/subscriptions?status=inconnu')).status).toBe(400);
  });
});

describe('tâches en échec', () => {
  it('liste les échecs par défaut, sans charge utile', async () => {
    const failed = await insertJob('failed');
    await insertJob('done');
    const res = await get('/admin/api/jobs?limit=100');
    expect(res.status).toBe(200);
    const items = (res.body as { items: { id: string; status: string }[] }).items;
    expect(items.every((j) => j.status === 'failed')).toBe(true);
    const mine = items.find((j) => j.id === failed);
    expect(mine).toEqual({
      id: failed,
      type: jobType,
      status: 'failed',
      attempts: 5,
      lastError: 'handler_timeout',
      runAt: expect.any(String) as string,
      finishedAt: expect.any(String) as string,
      createdAt: expect.any(String) as string,
    });
  });

  it('relance : tâche remise en attente avec un nouveau budget d’essais, tracée', async () => {
    const id = await insertJob('failed');
    clock.advance(60_000);
    const res = await post(`/admin/api/jobs/${id}/retry`);
    expect(res.status).toBe(204);
    const [row] = await db.select().from(job).where(eq(job.id, id));
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 0,
      runAt: clock.now(),
      lastError: null,
      finishedAt: null,
      lockedUntil: null,
    });
    const traces = await db
      .select({ targetType: auditLog.targetType })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'admin.job_retry'), eq(auditLog.targetId, id)));
    expect(traces).toEqual([{ targetType: 'job' }]);
    // Déjà relancée : plus en échec.
    expect((await post(`/admin/api/jobs/${id}/retry`)).status).toBe(409);
  });

  it('tâche réussie → 409, inconnue → 404', async () => {
    expect((await post(`/admin/api/jobs/${await insertJob('done')}/retry`)).status).toBe(409);
    expect((await post(`/admin/api/jobs/${newId()}/retry`)).status).toBe(404);
  });
});

describe('journal d’audit', () => {
  it('chaque route admin inscrit l’accès avec son motif de route', async () => {
    const target = accounts[0]!.id;
    const calls: [() => request.Test, string][] = [
      [() => get('/admin/api/users'), 'GET /admin/api/users'],
      [() => get(`/admin/api/users/${target}`), 'GET /admin/api/users/:userId'],
      [() => get('/admin/api/subscriptions'), 'GET /admin/api/subscriptions'],
      [() => get('/admin/api/jobs'), 'GET /admin/api/jobs'],
      [() => post(`/admin/api/jobs/${newId()}/retry`), 'POST /admin/api/jobs/:jobId/retry'],
      [() => get('/admin/api/stats'), 'GET /admin/api/stats'],
      [() => get('/admin/api/audit'), 'GET /admin/api/audit'],
    ];
    for (const [call, route] of calls) {
      clock.advance(1000);
      await call();
      const [last] = await db
        .select({ route: auditLog.route })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.actorUserId, admin.id),
            eq(auditLog.action, 'admin.access'),
            eq(auditLog.createdAt, clock.now()),
          ),
        );
      expect(last?.route).toBe(route);
    }
  });

  it('GET /admin/api/audit filtre par acteur, action et cible', async () => {
    const res = await get(
      `/admin/api/audit?actorUserId=${admin.id}&action=admin.user_view&targetId=${accounts[0]!.id}`,
    );
    expect(res.status).toBe(200);
    const items = (res.body as { items: Record<string, unknown>[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every(
        (i) =>
          i.actorUserId === admin.id &&
          i.action === 'admin.user_view' &&
          i.targetType === 'user' &&
          i.targetId === accounts[0]!.id,
      ),
    ).toBe(true);
    expect((await get('/admin/api/audit?action=DROP%20TABLE')).status).toBe(400);
  });

  it('GET /admin/api/audit pagine sans perte ni doublon (plus récent d’abord)', async () => {
    for (let i = 0; i < 3; i += 1) await get(`/admin/api/users/${accounts[2]!.id}`);
    const filter = `actorUserId=${admin.id}&action=admin.user_view&targetId=${accounts[2]!.id}`;
    const all = (await get(`/admin/api/audit?${filter}`)).body as {
      items: { id: string; createdAt: string }[];
    };
    expect(all.items.length).toBeGreaterThanOrEqual(3);
    const paged: string[] = [];
    let cursor = '';
    do {
      const page = (await get(`/admin/api/audit?${filter}&limit=1${cursor && `&cursor=${cursor}`}`))
        .body as { items: { id: string }[]; nextCursor: string | null };
      paged.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? '';
    } while (cursor);
    expect(paged).toEqual(all.items.map((i) => i.id));
  });
});
