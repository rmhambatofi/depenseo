// Carnets (§8.3, NF-SEC-03) : `GET /notebooks` et garde `NotebookAccessGuard` sur
// `GET /notebooks/{notebookId}`.
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notebook, notebookMember } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { createTenant, problemWithoutInstance, type Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';

describe('carnets (§8.3)', () => {
  const clock = new FakeClock(Date.UTC(2026, 3, 8, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const get = (actor: Tenant, path: string) =>
    request(http(app)).get(`/api/v1${path}`).set('Authorization', `Bearer ${actor.accessToken}`);

  /** Ajoute `member` au carnet de `owner` (le partage, hors MVP, n'a pas de route). */
  const addMember = async (owner: Tenant, member: Tenant) => {
    await db.insert(notebookMember).values({
      id: newId(),
      notebookId: owner.notebookId,
      userId: member.id,
      role: 'member',
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
  };

  it('liste les carnets du compte : son carnet personnel seulement', async () => {
    const alice = await createTenant(app, db, clock.now());
    await createTenant(app, db, clock.now());
    const res = await get(alice, '/notebooks').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual([
      { id: alice.notebookId, name: 'Mon carnet', kind: 'personal', role: 'owner' },
    ]);
  });

  it('lit son carnet ; un carnet d’autrui, inconnu ou mal formé → même 404', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    const own = await get(alice, `/notebooks/${alice.notebookId}`).expect(200);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.body).toEqual({
      id: alice.notebookId,
      name: 'Mon carnet',
      kind: 'personal',
      role: 'owner',
    });

    const foreign = await get(bob, `/notebooks/${alice.notebookId}`).expect(404);
    const unknown = await get(bob, `/notebooks/${newId()}`).expect(404);
    const malformed = await get(bob, '/notebooks/pas-un-uuid').expect(404);
    expect(problemWithoutInstance(foreign.body)).toEqual(problemWithoutInstance(unknown.body));
    expect(problemWithoutInstance(malformed.body)).toEqual(problemWithoutInstance(unknown.body));
    expect(foreign.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('un membre accède au carnet partagé, rôle `member` ; retiré, il n’y accède plus', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    await addMember(alice, bob);

    const shared = await get(bob, `/notebooks/${alice.notebookId}`).expect(200);
    expect(shared.body).toMatchObject({ id: alice.notebookId, role: 'member' });
    const list = await get(bob, '/notebooks').expect(200);
    expect((list.body as { id: string }[]).map((n) => n.id).sort()).toEqual(
      [alice.notebookId, bob.notebookId].sort(),
    );

    await db
      .update(notebookMember)
      .set({ deletedAt: clock.now(), updatedAt: clock.now() })
      .where(
        and(eq(notebookMember.notebookId, alice.notebookId), eq(notebookMember.userId, bob.id)),
      );
    await get(bob, `/notebooks/${alice.notebookId}`).expect(404);
    expect(((await get(bob, '/notebooks')).body as { id: string }[]).map((n) => n.id)).toEqual([
      bob.notebookId,
    ]);
  });

  it('un carnet supprimé logiquement est introuvable, même pour son propriétaire', async () => {
    const alice = await createTenant(app, db, clock.now());
    await db
      .update(notebook)
      .set({ deletedAt: clock.now(), updatedAt: clock.now() })
      .where(eq(notebook.id, alice.notebookId));
    await get(alice, `/notebooks/${alice.notebookId}`).expect(404);
    expect((await get(alice, '/notebooks').expect(200)).body).toEqual([]);
  });

  it('sans jeton → 401 (garde globale avant la garde de carnet)', async () => {
    const alice = await createTenant(app, db, clock.now());
    await request(http(app)).get(`/api/v1/notebooks/${alice.notebookId}`).expect(401);
  });
});
