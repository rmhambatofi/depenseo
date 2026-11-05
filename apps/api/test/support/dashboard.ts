// Tableau de bord (P3-05) : dépenses écrites en base dans une catégorie choisie, plan des catégories
// du carnet (racines et sous-catégories) et lecture de `GET …/dashboard`.
import type { INestApplication } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import type { DashboardView } from '../../src/dashboard/dashboard.service.js';
import type { Database } from '../../src/db/connection.js';
import { category, type ExpenseSource, expense } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { Tenant } from './access.js';
import { http } from './app.js';
import { auth } from './expenses.js';

const STAMP = new Date(Date.UTC(2026, 0, 1));

/** Racines ayant au moins deux sous-catégories, avec leurs sous-catégories. */
export interface CategoryPlan {
  roots: { id: string; subs: string[] }[];
}

export function dashboardClient(app: () => INestApplication, db: Database) {
  return {
    async plan(t: Tenant): Promise<CategoryPlan> {
      const rows = await db
        .select({ id: category.id, parentId: category.parentId })
        .from(category)
        .where(and(eq(category.notebookId, t.notebookId), isNull(category.deletedAt)));
      const subs = new Map<string, string[]>();
      for (const r of rows) {
        if (r.parentId) subs.set(r.parentId, [...(subs.get(r.parentId) ?? []), r.id]);
      }
      return {
        roots: [...subs]
          .filter(([, ids]) => ids.length >= 2)
          .map(([id, ids]) => ({ id, subs: ids })),
      };
    },
    /** Dépense insérée en base ; renvoie son identifiant. */
    async spend(
      t: Tenant,
      categoryId: string,
      spentOn: string,
      amount: number,
      opts: { source?: ExpenseSource; currency?: string; deleted?: boolean } = {},
    ) {
      const id = newId();
      await db.insert(expense).values({
        id,
        notebookId: t.notebookId,
        amount,
        currency: opts.currency ?? 'EUR',
        categoryId,
        spentOn,
        source: opts.source ?? 'manual',
        createdAt: STAMP,
        updatedAt: STAMP,
        deletedAt: opts.deleted ? STAMP : null,
      });
      return id;
    },
    get: (t: Tenant) =>
      request(http(app())).get(`/api/v1/notebooks/${t.notebookId}/dashboard`).set(auth(t)),
    async dashboard(t: Tenant) {
      const res = await this.get(t);
      if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
      return res.body as DashboardView;
    },
  };
}
