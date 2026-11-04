// NF-SEC-03, §8.3 : l'utilisateur B ne voit ni ne modifie les données de A, sur chaque route
// protégée existante. Classement obligatoire de toute nouvelle route (voir `test/support/access.ts`) :
// - route de carnet (`{notebookId}` dans le chemin) : B reçoit 404 avec le carnet de A, comme pour
//   un carnet inexistant ; A n'est pas refusé (le test mord) ; rien n'est modifié chez A ;
// - route de compte (liste blanche ci-dessous) : la réponse faite à B ne contient rien de A.
import type { INestApplication } from '@nestjs/common';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/connection.js';
import { category, expense, expenseTag, tag, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import {
  callAs,
  problemWithoutInstance,
  createTenant,
  type Route,
  routeKey,
  routesOf,
  type Tenant,
} from '../support/access.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { notebooksOf } from '../support/notebooks.js';
import { PUBLIC_ROUTES } from '../support/public-routes.js';

/** Routes du compte connecté, sans identifiant de ressource dans le chemin. */
const ACCOUNT_ROUTES = ['GET /api/v1/me', 'PATCH /api/v1/me', 'GET /api/v1/notebooks'];

/** Corps valides par route d'écriture (sinon `{}`), pour que l'appelant ne soit pas refusé. */
const BODIES: Record<string, (owner: Tenant) => object> = {
  'PATCH /api/v1/me': () => ({ language: 'en', timeZone: 'America/Montreal', currency: 'CHF' }),
  'POST /api/v1/notebooks/{notebookId}/categories': () => ({
    id: newId(),
    name: 'Intrusion',
    icon: '🕵️',
    color: '#000000',
  }),
  'PATCH /api/v1/notebooks/{notebookId}/categories/{categoryId}': () => ({
    name: 'Renommée',
    hidden: true,
  }),
  'POST /api/v1/notebooks/{notebookId}/expenses': () => ({
    id: newId(),
    amount: 666,
    categoryId: newId(),
    date: '2026-04-07',
    tags: ['intrus'],
  }),
  'PATCH /api/v1/notebooks/{notebookId}/expenses/{expenseId}': () => ({
    amount: 1,
    note: 'modifiée',
    tags: ['intrus'],
  }),
};

/** Identifiants de ressources de A autres que le carnet, par nom de paramètre de chemin. */
const RESOURCE_PARAMS: Record<string, (owner: Tenant, db: Database) => Promise<string>> = {
  // Catégorie personnalisée (une catégorie du plan ne se supprime pas : 409, garde non éprouvée).
  categoryId: async (owner, db) => {
    const id = newId();
    const now = new Date();
    await db.insert(category).values({
      id,
      notebookId: owner.notebookId,
      name: 'Ressource de A',
      icon: '🔒',
      color: '#111111',
      position: 1000,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
  // Dépense active de A avec une étiquette : modification, suppression, étiquetage observables.
  expenseId: async (owner, db) => {
    const id = newId();
    const tagId = newId();
    const now = new Date();
    const [cat] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.notebookId, owner.notebookId), isNotNull(category.systemKey)))
      .limit(1);
    await db.insert(expense).values({
      id,
      notebookId: owner.notebookId,
      amount: 4200,
      currency: 'EUR',
      categoryId: cat!.id,
      spentOn: '2026-04-07',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(tag).values({
      id: tagId,
      notebookId: owner.notebookId,
      name: `A-${id}`,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(expenseTag).values({ id: newId(), expenseId: id, tagId });
    return id;
  },
};

/** Tables filles du carnet, relues après chaque appel de B : rien ne doit changer chez A. */
const notebookRows = async (db: Database, notebookId: string) => ({
  categories: await db
    .select()
    .from(category)
    .where(eq(category.notebookId, notebookId))
    .orderBy(asc(category.id)),
  expenses: await db
    .select()
    .from(expense)
    .where(eq(expense.notebookId, notebookId))
    .orderBy(asc(expense.id)),
  tags: await db.select().from(tag).where(eq(tag.notebookId, notebookId)).orderBy(asc(tag.id)),
  expenseTags: await db
    .select({ expenseId: expenseTag.expenseId, tagId: expenseTag.tagId })
    .from(expenseTag)
    .innerJoin(expense, eq(expense.id, expenseTag.expenseId))
    .where(eq(expense.notebookId, notebookId))
    .orderBy(asc(expenseTag.expenseId), asc(expenseTag.tagId)),
});

describe('isolement entre comptes (NF-SEC-03)', () => {
  const clock = new FakeClock(Date.UTC(2026, 3, 7, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;
  let alice: Tenant;
  let bob: Tenant;
  let protectedRoutes: Route[];
  /** Ligne `user` de A, relue après chaque appel de B : rien ne doit changer. */
  let aliceAccount: unknown;
  const accountRow = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
    alice = await createTenant(app, db, clock.now());
    bob = await createTenant(app, db, clock.now());
    aliceAccount = await accountRow(alice.id);
    protectedRoutes = routesOf(app).filter((route) => !PUBLIC_ROUTES.includes(routeKey(route)));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const notebookRoutes = () => protectedRoutes.filter((r) => r.path.includes('{notebookId}'));

  it('chaque route protégée est classée : carnet ou compte', () => {
    const unclassified = protectedRoutes
      .filter((r) => !r.path.includes('{notebookId}'))
      .map(routeKey)
      .filter((key) => !ACCOUNT_ROUTES.includes(key));
    expect(unclassified).toEqual([]);
    // La liste de compte ne doit pas retenir une route disparue.
    expect(ACCOUNT_ROUTES.filter((key) => !protectedRoutes.map(routeKey).includes(key))).toEqual(
      [],
    );
    expect(notebookRoutes().length).toBeGreaterThan(0);
  });

  it('routes de carnet : B reçoit 404 sur le carnet de A, comme sur un carnet inexistant', async () => {
    for (const route of notebookRoutes()) {
      const key = routeKey(route);
      const params: Record<string, string> = { notebookId: alice.notebookId };
      for (const [name, make] of Object.entries(RESOURCE_PARAMS)) {
        if (route.path.includes(`{${name}}`)) params[name] = await make(alice, db);
      }
      const body = BODIES[key]?.(alice) ?? {};
      const before = await notebooksOf(db, alice.id);
      const rowsBefore = await notebookRows(db, alice.notebookId);

      const intruder = await callAs(app, bob, route, params, body);
      const unknown = await callAs(app, bob, route, { ...params, notebookId: newId() }, body);
      expect(intruder.status, key).toBe(404);
      expect(problemWithoutInstance(intruder.body), key).toEqual(
        problemWithoutInstance(unknown.body),
      );
      // Ressource fille de A (`{expenseId}`…) par le carnet de B : la garde passe, seul le filtre
      // `notebook_id` de la route protège A.
      if (Object.keys(params).length > 1) {
        const viaOwn = await callAs(
          app,
          bob,
          route,
          { ...params, notebookId: bob.notebookId },
          body,
        );
        expect(viaOwn.status, `${key} (via le carnet de B)`).toBe(404);
      }
      // Étendre `notebookRows` à chaque nouvelle table de carnet (dépenses…).
      expect(await notebookRows(db, alice.notebookId), key).toEqual(rowsBefore);
      expect(await notebooksOf(db, alice.id), key).toEqual(before);
      expect(await accountRow(alice.id), key).toEqual(aliceAccount);

      // Contre-épreuve : A, lui, passe la garde.
      const owner = await callAs(app, alice, route, params, body);
      expect([401, 403, 404], `${key} (propriétaire)`).not.toContain(owner.status);
      expect(owner.status, `${key} (propriétaire)`).toBeLessThan(500);
    }
  });

  it('routes de compte : la réponse faite à B ne contient rien de A', async () => {
    for (const key of ACCOUNT_ROUTES) {
      const route = protectedRoutes.find((r) => routeKey(r) === key)!;
      const before = await notebooksOf(db, alice.id);
      const rowsBefore = await notebookRows(db, alice.notebookId);
      const res = await callAs(app, bob, route, {}, BODIES[key]?.(bob) ?? {});
      expect(await notebookRows(db, alice.notebookId), key).toEqual(rowsBefore);
      expect(await notebooksOf(db, alice.id), key).toEqual(before);
      expect(await accountRow(alice.id), key).toEqual(aliceAccount);
      expect(res.status, key).toBe(200);
      const text = JSON.stringify(res.body);
      for (const secret of [alice.id, alice.email, alice.notebookId]) {
        expect(text, key).not.toContain(secret);
      }
      // Contre-épreuve : la même route renvoie bien des données de B.
      expect(text, key).toMatch(new RegExp(`${bob.id}|${bob.notebookId}`));
    }
  });
});
