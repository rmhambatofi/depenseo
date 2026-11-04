// Sommes journalières des dépenses actives d'un carnet (F-LIM-03/04, ADR-028) : partagées par la
// jauge et par la détection des alertes, qui l'exécute dans la transaction d'écriture.
import { and, between, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import type { Database } from '../db/connection.js';
import { expense } from '../db/schema/index.js';
import type { DayTotal } from './period-summary.js';

/** Sommes par jour, origine et devise ; SUM(BIGINT) arrive en chaîne décimale exacte. */
export async function dayTotals(
  tx: Tx | Database,
  notebookId: string,
  from: string,
  to: string,
): Promise<DayTotal[]> {
  const rows = await tx
    .select({
      spentOn: expense.spentOn,
      source: expense.source,
      currency: expense.currency,
      total: sql<string>`cast(sum(${expense.amount}) as char)`,
    })
    .from(expense)
    .where(
      and(
        eq(expense.notebookId, notebookId),
        isNull(expense.deletedAt),
        between(expense.spentOn, from, to),
      ),
    )
    .groupBy(expense.spentOn, expense.source, expense.currency);
  return rows.map((r) => ({ ...r, total: BigInt(r.total) }));
}
