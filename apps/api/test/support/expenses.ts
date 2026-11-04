// Client de test des routes de dépenses (P2-02) : appels HTTP authentifiés et carnet prêt à l'emploi.
import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { Database } from '../../src/db/connection.js';
import { category, expense } from '../../src/db/schema/index.js';
import { createTenant, type Tenant } from './access.js';
import { http } from './app.js';
import type { FakeClock } from './clock.js';

export interface ExpenseBody {
  id: string;
  amount: number;
  currency: string;
  categoryId: string;
  date: string;
  note: string | null;
  merchant: string | null;
  tags: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  detail?: string;
}

/** Corps de réponse typé (dépense ou problème RFC 9457). */
export const json = (res: { body: unknown }) => res.body as ExpenseBody;

export const auth = (t: Tenant) => ({ Authorization: `Bearer ${t.accessToken}` });

export function expenseClient(app: () => INestApplication, db: Database, clock: FakeClock) {
  const base = (t: Tenant) => `/api/v1/notebooks/${t.notebookId}/expenses`;
  /** Première sous-catégorie du plan par défaut du carnet. */
  const someCategory = async (t: Tenant) => {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.notebookId, t.notebookId), sql`${category.parentId} is not null`))
      .limit(1);
    return row!.id;
  };
  return {
    create: (t: Tenant, body: object) => request(http(app())).post(base(t)).set(auth(t)).send(body),
    getOne: (t: Tenant, id: string) =>
      request(http(app()))
        .get(`${base(t)}/${id}`)
        .set(auth(t)),
    patch: (t: Tenant, id: string, body: object) =>
      request(http(app()))
        .patch(`${base(t)}/${id}`)
        .set(auth(t))
        .send(body),
    remove: (t: Tenant, id: string) =>
      request(http(app()))
        .delete(`${base(t)}/${id}`)
        .set(auth(t)),
    /** Liste filtrée (`GET …/expenses?…`, P2-03) ; un tableau devient un paramètre répété. */
    list: (t: Tenant, query: Record<string, string | number | string[]> = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
      }
      const qs = params.toString();
      return request(http(app()))
        .get(qs ? `${base(t)}?${qs}` : base(t))
        .set(auth(t));
    },
    restore: (t: Tenant, id: string) =>
      request(http(app()))
        .post(`${base(t)}/${id}/restore`)
        .set(auth(t)),
    /** Appel d'une route de catégorie du carnet (`''` ou `/{id}`). */
    categories: (t: Tenant, method: 'post' | 'patch' | 'delete', suffix = '', body?: object) =>
      request(http(app()))
        [method](`/api/v1/notebooks/${t.notebookId}/categories${suffix}`)
        .set(auth(t))
        .send(body),
    someCategory,
    /** Compte vérifié avec son carnet et une sous-catégorie du plan par défaut. */
    tenant: async () => {
      const t = await createTenant(app(), db, clock.now());
      return { t, categoryId: await someCategory(t) };
    },
    rowsWithId: (id: string) => db.select().from(expense).where(eq(expense.id, id)),
  };
}
