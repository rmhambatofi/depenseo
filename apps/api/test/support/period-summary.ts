// Jauge de limite (P3-02) : écriture directe des dépenses et versions de limite d'un carnet de test,
// à une date calendaire choisie, et lecture de `GET …/limits/current`.
import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { Database } from '../../src/db/connection.js';
import {
  category,
  type ExpenseSource,
  expense,
  type LimitPeriodKind,
  spendingLimit,
  user,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { CurrentLimitView } from '../../src/limits/period-summary.service.js';
import type { Tenant } from './access.js';
import { http } from './app.js';
import { auth } from './expenses.js';

const STAMP = new Date(Date.UTC(2026, 0, 1));

export function summaryClient(app: () => INestApplication, db: Database) {
  const firstCategory = async (t: Tenant) => {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.notebookId, t.notebookId), sql`${category.parentId} is not null`))
      .limit(1);
    return row!.id;
  };
  return {
    async spend(
      t: Tenant,
      spentOn: string,
      amount: number,
      opts: { source?: ExpenseSource; currency?: string; deleted?: boolean } = {},
    ) {
      await db.insert(expense).values({
        id: newId(),
        notebookId: t.notebookId,
        amount,
        currency: opts.currency ?? 'EUR',
        categoryId: await firstCategory(t),
        spentOn,
        source: opts.source ?? 'manual',
        createdAt: STAMP,
        updatedAt: STAMP,
        deletedAt: opts.deleted ? STAMP : null,
      });
    },
    async limit(
      t: Tenant,
      effectiveDate: string,
      amount: number | null,
      opts: { periodKind?: LimitPeriodKind; startDay?: number; includeRecurring?: boolean } = {},
    ) {
      const id = newId();
      await db.insert(spendingLimit).values({
        id,
        notebookId: t.notebookId,
        periodKind: opts.periodKind ?? 'month',
        startDay: opts.startDay ?? 1,
        amount,
        currency: 'EUR',
        includeRecurring: opts.includeRecurring ?? true,
        effectiveDate,
        createdAt: STAMP,
        updatedAt: STAMP,
      });
      return id;
    },
    setTimeZone: (t: Tenant, timeZone: string) =>
      db.update(user).set({ timeZone }).where(eq(user.id, t.id)),
    get: (t: Tenant, query = '') =>
      request(http(app()))
        .get(`/api/v1/notebooks/${t.notebookId}/limits/current${query}`)
        .set(auth(t)),
    async current(t: Tenant, query = '') {
      const res = await this.get(t, query);
      if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
      return res.body as CurrentLimitView;
    },
  };
}
