// Noms d'étiquettes des dépenses, par lot (liste P2-03, synchronisation P2-04).
import { asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import type { Database } from '../db/connection.js';
import { expenseTag, tag } from '../db/schema/index.js';

/** Noms d'étiquettes par dépense, triés selon la collation de la base. */
export async function tagNamesByExpense(
  tx: Tx | Database,
  expenseIds: string[],
): Promise<Map<string, string[]>> {
  const byExpense = new Map<string, string[]>();
  if (expenseIds.length === 0) return byExpense;
  const rows = await tx
    .select({ expenseId: expenseTag.expenseId, name: tag.name })
    .from(expenseTag)
    .innerJoin(tag, eq(tag.id, expenseTag.tagId))
    .where(inArray(expenseTag.expenseId, expenseIds))
    .orderBy(asc(tag.name), asc(tag.id));
  for (const { expenseId, name } of rows) {
    byExpense.set(expenseId, [...(byExpense.get(expenseId) ?? []), name]);
  }
  return byExpense;
}
