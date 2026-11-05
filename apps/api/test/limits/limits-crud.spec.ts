// Limite globale (F-LIM-01/02/05/09, ADR-027) : versions datées du jour du compte, rejeu
// idempotent, une seule version par jour (409), modification de la version du jour seulement.
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spendingLimit, user } from '../../src/db/schema/index.js';
import { newId, uuidToBinary } from '../../src/db/uuid.js';
import { versionInForce } from '../../src/limits/limit-history.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http } from '../support/app.js';
import { startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { auth } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';

interface LimitBody {
  id: string;
  amount: number | null;
  currency: string;
  periodKind: 'month' | 'week';
  startDay: number;
  includeRecurring: boolean;
  effectiveDate: string;
  appliesFrom: string;
  createdAt: string;
  updatedAt: string;
  detail?: string;
}
const body = (res: { body: unknown }) => res.body as LimitBody;

describe('limite globale (F-LIM-01/02/05/09)', () => {
  // 2026-03-01 03:00 UTC : 1er mars à Paris, Lisbonne, La Réunion ; encore le 28 février à Montréal.
  const clock = new FakeClock(Date.UTC(2026, 2, 1, 3, 0, 0));
  const { pool, db } = testDb(2);
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const base = (t: Tenant) => `/api/v1/notebooks/${t.notebookId}/limits`;
  const create = (t: Tenant, payload: object) =>
    request(http(app)).post(base(t)).set(auth(t)).send(payload);
  const patch = (t: Tenant, id: string, payload: object) =>
    request(http(app))
      .patch(`${base(t)}/${id}`)
      .set(auth(t))
      .send(payload);
  const list = async (t: Tenant) =>
    (await request(http(app)).get(base(t)).set(auth(t)).expect(200)).body as LimitBody[];
  const tenant = () => createTenant(app, db, clock.now());
  /** Recule la date d'effet en base (simule une version créée un jour passé). */
  const backdate = (id: string, effectiveDate: string) =>
    db.update(spendingLimit).set({ effectiveDate }).where(eq(spendingLimit.id, id));

  it('crée une limite mensuelle par défaut, datée du jour du compte (201)', async () => {
    const t = await tenant();
    const id = newId();
    const res = await create(t, { id, amount: 150_000 });
    expect(res.status).toBe(201);
    expect(body(res)).toEqual({
      id,
      amount: 150_000,
      currency: 'EUR',
      periodKind: 'month',
      startDay: 1,
      includeRecurring: true,
      effectiveDate: '2026-03-01',
      appliesFrom: '2026-03-01',
      createdAt: clock.now().toISOString(),
      updatedAt: clock.now().toISOString(),
    });
    expect(await list(t)).toEqual([body(res)]);
    // Colonne générée : clé nulle sur 16 octets pour la limite globale ; montant en BIGINT.
    const [raw] = (await db.execute(
      sql`select hex(category_key) as k, amount, cast(effective_date as char) as d
          from spending_limit where id = ${uuidToBinary(id)}`,
    )) as unknown as [Array<{ k: string; amount: number | string; d: string }>];
    expect(raw[0]).toMatchObject({ k: '0'.repeat(32), d: '2026-03-01' });
    expect(Number(raw[0]!.amount)).toBe(150_000);
  });

  it('semaine, jour de début, récurrences exclues, devise du compte (F-LIM-01/02/05)', async () => {
    const t = await tenant();
    await db.update(user).set({ currency: 'CHF' }).where(eq(user.id, t.id));
    const res = await create(t, {
      id: newId(),
      amount: 20_000,
      periodKind: 'week',
      startDay: 3,
      includeRecurring: false,
    });
    expect(res.status).toBe(201);
    // 2026-03-01 est un dimanche : la semaine commençant le mercredi a débuté le 25 février.
    expect(body(res)).toMatchObject({
      currency: 'CHF',
      periodKind: 'week',
      startDay: 3,
      includeRecurring: false,
      appliesFrom: '2026-02-25',
    });
  });

  it('date d’effet calculée dans le fuseau du compte (NF-FMT-04)', async () => {
    const expected: Record<string, string> = {
      'Europe/Paris': '2026-03-01',
      'America/Montreal': '2026-02-28',
      'Europe/Lisbon': '2026-03-01',
      'Indian/Reunion': '2026-03-01',
    };
    for (const [timeZone, date] of Object.entries(expected)) {
      const t = await tenant();
      await db.update(user).set({ timeZone }).where(eq(user.id, t.id));
      const res = await create(t, { id: newId(), amount: 1000 });
      expect(body(res).effectiveDate, timeZone).toBe(date);
    }
  });

  it('fuseau changé vers l’ouest : pas de version antérieure à la dernière (409)', async () => {
    const t = await tenant();
    await db.update(user).set({ timeZone: 'Indian/Reunion' }).where(eq(user.id, t.id));
    await create(t, { id: newId(), amount: 1000 }).expect(201); // 2026-03-01 à La Réunion
    await db.update(user).set({ timeZone: 'America/Montreal' }).where(eq(user.id, t.id));
    const res = await create(t, { id: newId(), amount: 2000 }); // encore le 28 février
    expect(res.status).toBe(409);
    expect((await list(t)).map((v) => v.effectiveDate)).toEqual(['2026-03-01']);
  });

  it('double envoi : une seule version, la première écriture gagne (NF-OFF-01)', async () => {
    const t = await tenant();
    const id = newId();
    const first = await create(t, { id, amount: 5000 });
    const again = await create(t, { id, amount: 9999 });
    expect(again.status).toBe(201);
    expect(body(again)).toEqual(body(first));
    expect(await db.select().from(spendingLimit).where(eq(spendingLimit.id, id))).toHaveLength(1);
  });

  it('deux limites globales à la même date d’effet → 409', async () => {
    const t = await tenant();
    await create(t, { id: newId(), amount: 5000 }).expect(201);
    const res = await create(t, { id: newId(), amount: 6000 });
    expect(res.status).toBe(409);
    expect(await list(t)).toHaveLength(1);
  });

  it('changer la limite en cours de mois ne modifie pas la limite des périodes passées (F-LIM-09)', async () => {
    const t = await tenant();
    const old = body(await create(t, { id: newId(), amount: 50_000 }));
    await backdate(old.id, '2026-01-12');
    const current = body(await create(t, { id: newId(), amount: 80_000 }));
    const history = await list(t);
    expect(history.map((v) => [v.effectiveDate, v.appliesFrom, v.amount])).toEqual([
      ['2026-03-01', '2026-03-01', 80_000],
      ['2026-01-12', '2026-01-01', 50_000],
    ]);
    expect(versionInForce(history, '2026-02-15')?.amount).toBe(50_000);
    expect(versionInForce(history, '2026-03-01')?.id).toBe(current.id);
    // La version passée ne se modifie plus : elle appartient à l'historique.
    expect((await patch(t, old.id, { amount: 1 })).status).toBe(409);
    expect((await list(t))[1]!.amount).toBe(50_000);
  });

  it('l’index unique (carnet, clé générée, date d’effet) refuse deux limites globales le même jour', async () => {
    const t = await tenant();
    const row = (id: string) => ({
      id,
      notebookId: t.notebookId,
      periodKind: 'month' as const,
      startDay: 1,
      amount: 1000,
      currency: 'EUR',
      effectiveDate: '2026-02-14',
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(spendingLimit).values(row(newId()));
    // `category_id` NULL des deux côtés : sans la clé générée, l'index unique laisserait passer.
    await expect(db.insert(spendingLimit).values(row(newId()))).rejects.toMatchObject({
      cause: { errno: 1062 },
    });
  });

  it('passage mois → semaine : la semaine en cours ne remonte pas dans le mois terminé (F-LIM-09)', async () => {
    const t = await tenant();
    const old = body(await create(t, { id: newId(), amount: 50_000 }));
    await backdate(old.id, '2026-01-12');
    // 2026-03-01 est un dimanche : sa semaine commence le lundi 23 février, mois de février clos.
    const weekly = body(await create(t, { id: newId(), amount: 10_000, periodKind: 'week' }));
    expect(weekly.appliesFrom).toBe('2026-03-01');
    const history = await list(t);
    expect(versionInForce(history, '2026-02-28')?.amount).toBe(50_000);
    expect(versionInForce(history, '2026-03-01')?.amount).toBe(10_000);
  });

  it('suppression = nouvelle version sans montant, l’historique reste', async () => {
    const t = await tenant();
    const old = body(await create(t, { id: newId(), amount: 50_000 }));
    await backdate(old.id, '2026-02-03');
    const res = await create(t, { id: newId(), amount: null });
    expect(res.status).toBe(201);
    expect(body(res).amount).toBeNull();
    expect((await list(t)).map((v) => v.amount)).toEqual([null, 50_000]);
  });

  it('modifie la version du jour : montant, période, jour de début', async () => {
    const t = await tenant();
    const v = body(await create(t, { id: newId(), amount: 10_000, startDay: 28 }));
    expect(v.appliesFrom).toBe('2026-02-28');
    clock.advance(60_000);
    const res = await patch(t, v.id, { amount: 12_000, includeRecurring: false });
    expect(res.status).toBe(200);
    expect(body(res)).toMatchObject({
      amount: 12_000,
      startDay: 28,
      includeRecurring: false,
      createdAt: v.createdAt,
      updatedAt: clock.now().toISOString(),
    });
    // Jour 28 incompatible avec une semaine : il faut fournir un jour 1–7.
    expect((await patch(t, v.id, { periodKind: 'week' })).status).toBe(400);
    const weekly = await patch(t, v.id, { periodKind: 'week', startDay: 1 });
    expect(body(weekly)).toMatchObject({
      periodKind: 'week',
      startDay: 1,
      appliesFrom: '2026-02-23',
    });
    expect(body(await patch(t, v.id, { amount: null })).amount).toBeNull();
    expect((await patch(t, v.id, {})).status).toBe(400);
    expect((await patch(t, newId(), { amount: 1 })).status).toBe(404);
    expect((await patch(t, 'pas-un-uuid', { amount: 1 })).status).toBe(404);
  });

  it('les versions voyagent dans la synchronisation différentielle (NF-OFF-01)', async () => {
    const t = await tenant();
    const v = body(await create(t, { id: newId(), amount: 3000, periodKind: 'week' }));
    const res = await request(http(app))
      .get(`/api/v1/notebooks/${t.notebookId}/sync`)
      .set(auth(t))
      .expect(200);
    const { limits } = res.body as { limits: object[] };
    expect(limits).toEqual([
      {
        id: v.id,
        amount: 3000,
        currency: 'EUR',
        periodKind: 'week',
        startDay: 1,
        includeRecurring: true,
        effectiveDate: '2026-03-01',
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        deletedAt: null,
      },
    ]);
  });

  it.each([
    ['montant nul', { amount: 0 }],
    ['montant décimal', { amount: 10.5 }],
    ['montant en chaîne', { amount: '1000' }],
    ['montant trop grand', { amount: 100_000_000_000 }],
    ['montant absent', {}],
    ['jour 32', { amount: 1, startDay: 32 }],
    ['semaine jour 8', { amount: 1, periodKind: 'week', startDay: 8 }],
    ['période inconnue', { amount: 1, periodKind: 'year' }],
    ['date d’effet fournie', { amount: 1, effectiveDate: '2025-01-01' }],
    ['catégorie fournie', { amount: 1, categoryId: newId() }],
  ])('refuse un corps invalide (%s) → 400', async (_label, payload) => {
    const t = await tenant();
    const res = await create(t, { id: newId(), ...payload });
    expect(res.status).toBe(400);
    expect(await list(t)).toEqual([]);
  });

  it('refuse un identifiant qui n’est pas un UUID v7 → 400', async () => {
    const t = await tenant();
    const v4 = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect((await create(t, { id: v4, amount: 1 })).status).toBe(400);
  });

  it('identifiant d’un autre carnet → 409 ; version d’un autre carnet introuvable → 404', async () => {
    const a = await tenant();
    const b = await tenant();
    const id = newId();
    await create(a, { id, amount: 7000 }).expect(201);
    expect((await create(b, { id, amount: 7000 })).status).toBe(409);
    expect((await patch(b, id, { amount: 1 })).status).toBe(404);
    expect(await list(b)).toEqual([]);
    expect((await list(a))[0]!.amount).toBe(7000);
  });

  it('même identifiant créé en même temps dans deux carnets → un 201, un 409 « identifiant »', async () => {
    // Verrous de carnet distincts : sans relecture, la clé primaire en doublon passait pour un
    // « même jour » (message trompeur).
    for (let round = 0; round < 5; round++) {
      const [a, b] = await Promise.all([tenant(), tenant()]);
      const id = newId();
      const results = await Promise.all([
        create(a, { id, amount: 7000 }),
        create(b, { id, amount: 8000 }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const refused = results.find((r) => r.status === 409)!;
      expect(body(refused).detail).toBe('Identifiant de limite déjà utilisé');
    }
  });

  it('même identifiant rejoué en même temps dans le même carnet → la même version, sans doublon', async () => {
    const t = await tenant();
    const id = newId();
    const [first, second] = await Promise.all([
      create(t, { id, amount: 7000 }),
      create(t, { id, amount: 7000 }),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(body(second)).toEqual(body(first));
    expect(await list(t)).toHaveLength(1);
  });
});
