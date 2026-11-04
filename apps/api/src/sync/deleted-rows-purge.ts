// Purge des suppressions logiques de plus de 30 jours (§8.2, ADR-026). Les dépenses d'abord
// (liaisons d'étiquettes en cascade), puis les étiquettes et catégories que plus rien ne
// référence. Les FK `expense.category_id` et `expense_tag.tag_id` sont sans cascade (ADR-024) et
// `category.parent_id` est en cascade : une catégorie qui a encore une sous-catégorie, même
// supprimée, attend que celle-ci soit purgée.
import { and, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import type { Database } from '../db/connection.js';
import { category, expense, expenseTag, tag } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { PURGE_BATCH, type ScheduledTask } from '../jobs/scheduler.js';

export const SYNC_RETENTION_MS = 30 * 24 * 3_600_000;

const unusedTag = notExists(
  sql`(select 1 from ${expenseTag} where ${expenseTag.tagId} = ${tag.id})`,
);
const hasNoChild = notExists(
  // Alias explicite : la sous-requête porte sur la même table que la requête externe.
  sql`(select 1 from ${category} as ${sql.raw('child')} where ${sql.raw('child.parent_id')} = ${category.id})`,
);
const unusedCategory = notExists(
  sql`(select 1 from ${expense} where ${expense.categoryId} = ${category.id})`,
);

export function purgeDeletedSyncRows(batchSize = PURGE_BATCH): ScheduledTask {
  return {
    name: 'purge-deleted-sync-rows',
    async run(db, now) {
      const cutoff = new Date(now.getTime() - SYNC_RETENTION_MS);
      let total = 0;
      // Dépenses : suppression directe par lots.
      for (;;) {
        const deleted = await withTransaction(db, async (tx) => {
          const [result] = await tx
            .delete(expense)
            .where(and(isNotNull(expense.deletedAt), lt(expense.deletedAt, cutoff)))
            .limit(batchSize);
          return result.affectedRows;
        });
        total += deleted;
        if (deleted < batchSize) break;
      }
      total += await purgeUnreferenced(db, batchSize, async (tx) => {
        const ids = await tx
          .select({ id: tag.id })
          .from(tag)
          .where(and(isNotNull(tag.deletedAt), lt(tag.deletedAt, cutoff), unusedTag))
          .limit(batchSize);
        if (ids.length === 0) return 0;
        // MySQL 8 refuse une sous-requête sur la table supprimée : sélection puis suppression par
        // identifiants, la référence étant revérifiée au moment de supprimer.
        const [result] = await tx.delete(tag).where(
          and(
            inArray(
              tag.id,
              ids.map((r) => r.id),
            ),
            unusedTag,
          ),
        );
        return result.affectedRows;
      });
      // Une sous-catégorie purgée peut libérer son parent : boucle jusqu'à ce que rien ne bouge.
      total += await purgeUnreferenced(db, batchSize, async (tx) => {
        const ids = await tx
          .select({ id: category.id })
          .from(category)
          .where(
            and(
              isNotNull(category.deletedAt),
              lt(category.deletedAt, cutoff),
              unusedCategory,
              hasNoChild,
            ),
          )
          .limit(batchSize);
        if (ids.length === 0) return 0;
        // `hasNoChild` n'est pas revérifié ici (MySQL 8 refuse la sous-requête sur `category`) :
        // invariant applicatif, une sous-catégorie ne se crée que sous une racine active (ADR-023),
        // jamais sous une catégorie supprimée. Une future restauration de catégorie doit le préserver.
        const [result] = await tx.delete(category).where(
          and(
            inArray(
              category.id,
              ids.map((r) => r.id),
            ),
            unusedCategory,
          ),
        );
        return result.affectedRows;
      });
      return total;
    },
  };
}

/** Répète `batch` (une transaction par lot) jusqu'à ce qu'il ne supprime plus rien. */
async function purgeUnreferenced(
  db: Database,
  batchSize: number,
  batch: (tx: Tx) => Promise<number>,
): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await withTransaction(db, batch);
    total += deleted;
    if (deleted === 0) return total;
  }
}
