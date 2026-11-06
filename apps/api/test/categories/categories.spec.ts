// Catégories (F-CAT-01, F-CAT-02, §8.3, ADR-023) : plan par défaut à la création du carnet, CRUD des
// catégories personnalisées, masquage, suppression logique.
import type { INestApplication } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_PLAN } from '../../src/categories/default-plan.js';
import { category, notebook, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { TEST_PASSWORD } from '../support/users.js';

interface CategoryBody {
  id: string;
  parentId: string | null;
  systemKey: string | null;
  name: string;
  icon: string;
  color: string;
  hidden: boolean;
}

/** Corps de réponse typé (catégorie ou problème RFC 9457). */
const json = (res: { body: unknown }) => res.body as CategoryBody & { detail?: string };

const ROOTS_FR = [
  'Logement',
  'Énergie',
  'Courses',
  'Restaurants',
  'Transports',
  'Santé',
  'Assurances',
  'Impôts et taxes',
  'Enfants',
  'Loisirs',
  'Shopping',
  'Abonnements',
  'Cadeaux',
  'Divers',
];

describe('catégories (F-CAT-01, F-CAT-02)', () => {
  const clock = new FakeClock(Date.UTC(2026, 3, 9, 9, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const base = (t: Tenant, notebookId = t.notebookId) =>
    `/api/v1/notebooks/${notebookId}/categories`;
  const auth = (t: Tenant) => ({ Authorization: `Bearer ${t.accessToken}` });
  const list = async (t: Tenant, query = '') =>
    (
      await request(http(app))
        .get(`${base(t)}${query}`)
        .set(auth(t))
        .expect(200)
    ).body as CategoryBody[];
  const create = (t: Tenant, body: object) =>
    request(http(app)).post(base(t)).set(auth(t)).send(body);
  const patch = (t: Tenant, id: string, body: object) =>
    request(http(app))
      .patch(`${base(t)}/${id}`)
      .set(auth(t))
      .send(body);
  const remove = (t: Tenant, id: string) =>
    request(http(app))
      .delete(`${base(t)}/${id}`)
      .set(auth(t));
  const getOne = (t: Tenant, id: string) =>
    request(http(app))
      .get(`${base(t)}/${id}`)
      .set(auth(t));
  const custom = (overrides: object = {}) => ({
    id: newId(),
    name: 'Animaux',
    icon: '🐶',
    color: '#123abc',
    ...overrides,
  });

  it('plan par défaut à l’inscription : 14 racines françaises, avec sous-catégories', async () => {
    const alice = await createTenant(app, db, clock.now());
    const all = await list(alice);
    const roots = all.filter((c) => c.parentId === null);
    expect(roots.map((c) => c.name)).toEqual(ROOTS_FR);
    for (const root of roots) {
      expect(root.systemKey).not.toBeNull();
      // Clé d'icône du catalogue mobile (ADR-069), plus d'emoji.
      expect(root.icon).toMatch(/^[a-z][a-z_]*$/);
      expect(root.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(root.hidden).toBe(false);
      const children = all.filter((c) => c.parentId === root.id);
      expect(children.length, root.name).toBeGreaterThanOrEqual(2);
      // Une sous-catégorie hérite de l'icône et de la couleur de sa racine.
      for (const child of children)
        expect(child).toMatchObject({ icon: root.icon, color: root.color });
    }
    const expected = DEFAULT_CATEGORY_PLAN.reduce((n, r) => n + 1 + r.children.length, 0);
    expect(all).toHaveLength(expected);
  });

  it('plan par défaut dans la langue de l’inscription (en), dans la transaction du compte', async () => {
    const email = `cat-en-${newId()}@example.test`;
    await request(http(app))
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, acceptTerms: true, language: 'en' })
      .expect(202);
    const rows = await db
      .select({ name: category.name })
      .from(category)
      .innerJoin(notebook, eq(notebook.id, category.notebookId))
      .innerJoin(user, eq(user.id, notebook.ownerId))
      .where(and(eq(user.email, email), isNull(category.parentId)));
    expect(rows.map((r) => r.name).sort()).toEqual(DEFAULT_CATEGORY_PLAN.map((r) => r.en).sort());
  });

  it('icônes du plan par défaut : clés du plan, toutes distinctes (ADR-069)', async () => {
    const alice = await createTenant(app, db, clock.now());
    const roots = (await list(alice)).filter((c) => c.parentId === null);
    expect(roots.map((c) => c.icon)).toEqual(DEFAULT_CATEGORY_PLAN.map((r) => r.icon));
    expect(new Set(roots.map((c) => c.icon)).size).toBe(roots.length);
  });

  it('catégorie personnalisée avec une clé d’icône (ADR-069)', async () => {
    const alice = await createTenant(app, db, clock.now());
    const body = custom({ icon: 'pets' });
    expect((await create(alice, body).expect(201)).body).toMatchObject({ icon: 'pets' });
    const res = await patch(alice, body.id, { icon: 'cart' }).expect(200);
    expect(res.body).toMatchObject({ icon: 'cart' });
  });

  it('catégorie personnalisée : emoji stockés sans perte, couleur normalisée', async () => {
    const alice = await createTenant(app, db, clock.now());
    const body = custom({ name: 'Famille 👨‍👩‍👧‍👦 & 🍕', icon: '👨‍👩‍👧‍👦' });
    const res = await create(alice, body).expect(201);
    expect(res.body).toEqual({
      id: body.id,
      parentId: null,
      systemKey: null,
      name: 'Famille 👨‍👩‍👧‍👦 & 🍕',
      icon: '👨‍👩‍👧‍👦',
      color: '#123ABC',
      hidden: false,
    });
    const [row] = await db.select().from(category).where(eq(category.id, body.id));
    expect(row).toMatchObject({ name: body.name, icon: body.icon, notebookId: alice.notebookId });
    expect((await getOne(alice, body.id).expect(200)).body).toEqual(res.body);
    expect((await list(alice)).map((c) => c.id)).toContain(body.id);
  });

  it('création idempotente par UUID client : double envoi → une seule ligne, la première gagne', async () => {
    const alice = await createTenant(app, db, clock.now());
    const body = custom();
    await create(alice, body).expect(201);
    const replay = await create(alice, { ...body, name: 'Autre nom' }).expect(201);
    expect(json(replay).name).toBe('Animaux');
    expect(await db.select().from(category).where(eq(category.id, body.id))).toHaveLength(1);
  });

  it('UUID déjà utilisé dans un autre carnet → 409, rien ne change chez l’autre', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    const body = custom();
    await create(alice, body).expect(201);
    await create(bob, { ...body, name: 'Volé' }).expect(409);
    const [row] = await db.select().from(category).where(eq(category.id, body.id));
    expect(row).toMatchObject({ notebookId: alice.notebookId, name: 'Animaux' });
  });

  it('corps invalide → 400 (nom vide, couleur, UUID non v7, clé inconnue)', async () => {
    const alice = await createTenant(app, db, clock.now());
    await create(alice, custom({ name: '   ' })).expect(400);
    await create(alice, custom({ name: 'x'.repeat(101) })).expect(400);
    await create(alice, custom({ color: 'red' })).expect(400);
    await create(alice, custom({ icon: '' })).expect(400);
    await create(alice, custom({ id: '0b2a3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b' })).expect(400);
    await create(alice, custom({ id: '019a3f5e-1c2d-7e5f-ca9b-0c1d2e3f4a5b' })).expect(400);
    await create(alice, custom({ systemKey: 'housing' })).expect(400);
    await patch(alice, newId(), { name: 'x', hidden: 'oui' }).expect(400);
  });

  it('sous-catégorie : parent racine du même carnet, sinon 422', async () => {
    const alice = await createTenant(app, db, clock.now());
    const bob = await createTenant(app, db, clock.now());
    const housing = (await list(alice)).find((c) => c.systemKey === 'housing')!;
    const rent = (await list(alice)).find((c) => c.systemKey === 'housing.rent')!;
    const child = custom({ parentId: housing.id, name: 'Garage' });
    expect((await create(alice, child).expect(201)).body).toMatchObject({ parentId: housing.id });

    // Troisième niveau, parent inconnu, parent d'un autre carnet : même refus.
    const deep = await create(alice, custom({ parentId: rent.id })).expect(422);
    const unknown = await create(alice, custom({ parentId: newId() })).expect(422);
    const bobRoot = (await list(bob)).find((c) => c.parentId === null)!;
    const foreign = await create(alice, custom({ parentId: bobRoot.id })).expect(422);
    expect(json(foreign).detail).toBe(json(unknown).detail);
    expect(json(deep).detail).toBe(json(unknown).detail);

    // Une racine qui a des enfants ne peut pas devenir sous-catégorie ; ni être son propre parent.
    const other = (await list(alice)).find((c) => c.systemKey === 'energy')!;
    await patch(alice, housing.id, { parentId: other.id }).expect(422);
    const lone = custom();
    await create(alice, lone).expect(201);
    await patch(alice, lone.id, { parentId: lone.id }).expect(422);
    expect(json(await patch(alice, lone.id, { parentId: other.id }).expect(200)).parentId).toBe(
      other.id,
    );
    expect(json(await patch(alice, lone.id, { parentId: null }).expect(200)).parentId).toBeNull();
  });

  it('modifie nom, icône, couleur, y compris d’une catégorie du plan', async () => {
    const alice = await createTenant(app, db, clock.now());
    const groceries = (await list(alice)).find((c) => c.systemKey === 'groceries')!;
    clock.advance(1000);
    const res = await patch(alice, groceries.id, {
      name: 'Alimentation',
      icon: '🥕',
      color: '#00aa00',
    }).expect(200);
    expect(res.body).toMatchObject({
      id: groceries.id,
      systemKey: 'groceries',
      name: 'Alimentation',
      icon: '🥕',
      color: '#00AA00',
    });
    const [row] = await db.select().from(category).where(eq(category.id, groceries.id));
    expect(row!.updatedAt).toEqual(clock.now());
    await patch(alice, groceries.id, {}).expect(400);
    await patch(alice, groceries.id, { name: 'ok', position: 3 }).expect(400);
    await patch(alice, newId(), { name: 'x' }).expect(404);
  });

  it('masquage : absente des listes actives, conservée et lisible par identifiant', async () => {
    const alice = await createTenant(app, db, clock.now());
    const all = await list(alice);
    const health = all.find((c) => c.systemKey === 'health')!;
    const pharmacy = all.find((c) => c.systemKey === 'health.pharmacy')!;
    const shopping = all.find((c) => c.systemKey === 'shopping.clothing')!;

    await patch(alice, shopping.id, { hidden: true }).expect(200);
    await patch(alice, health.id, { hidden: true }).expect(200);
    const active = (await list(alice)).map((c) => c.id);
    expect(active).not.toContain(shopping.id);
    expect(active).not.toContain(health.id);
    // Racine masquée → ses sous-catégories aussi.
    expect(active).not.toContain(pharmacy.id);

    const withHidden = await list(alice, '?includeHidden=true');
    expect(await list(alice, '?includeHidden=false')).toHaveLength(active.length);
    await request(http(app))
      .get(`${base(alice)}?includeHidden=1`)
      .set(auth(alice))
      .expect(400);
    expect(withHidden).toHaveLength(all.length);
    expect(withHidden.find((c) => c.id === health.id)!.hidden).toBe(true);
    expect(json(await getOne(alice, shopping.id).expect(200)).hidden).toBe(true);

    await patch(alice, health.id, { hidden: false }).expect(200);
    expect((await list(alice)).map((c) => c.id)).toContain(pharmacy.id);
  });

  it('suppression logique d’une catégorie personnalisée ; plan par défaut et parent non vide → 409', async () => {
    const alice = await createTenant(app, db, clock.now());
    const root = custom({ name: 'Animaux' });
    const child = custom({ name: 'Vétérinaire', parentId: root.id });
    await create(alice, root).expect(201);
    await create(alice, child).expect(201);

    await remove(alice, root.id).expect(409);
    const housing = (await list(alice)).find((c) => c.systemKey === 'housing.rent')!;
    await remove(alice, housing.id).expect(409);

    clock.advance(1000);
    await remove(alice, child.id).expect(204);
    await remove(alice, child.id).expect(204); // rejeu hors ligne
    await getOne(alice, child.id).expect(404);
    await patch(alice, child.id, { name: 'x' }).expect(404);
    expect((await list(alice, '?includeHidden=true')).map((c) => c.id)).not.toContain(child.id);
    // Ligne conservée (dépenses existantes, synchronisation) avec sa date de suppression.
    const [row] = await db.select().from(category).where(eq(category.id, child.id));
    expect(row).toMatchObject({ deletedAt: clock.now(), updatedAt: clock.now() });
    // Recréer avec le même identifiant ne ressuscite pas la catégorie.
    await create(alice, child).expect(409);

    await remove(alice, root.id).expect(204);
    await remove(alice, newId()).expect(404);
  });
});
