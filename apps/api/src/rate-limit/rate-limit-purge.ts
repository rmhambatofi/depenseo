// Purge des seaux dont la fenêtre est échue (ADR-062) : la table ne garde que 15 min d'empreintes.
import { lte } from 'drizzle-orm';
import { rateLimit } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { PURGE_BATCH, type ScheduledTask } from '../jobs/scheduler.js';
import { RATE_LIMIT_WINDOW_MS } from './rate-limiter.js';

export function purgeExpiredRateLimits(batchSize = PURGE_BATCH): ScheduledTask {
  return {
    name: 'purge-expired-rate-limits',
    async run(db, now) {
      const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
      let total = 0;
      for (;;) {
        const deleted = await withTransaction(db, async (tx) => {
          const [result] = await tx
            .delete(rateLimit)
            .where(lte(rateLimit.windowStartedAt, cutoff))
            .limit(batchSize);
          return result.affectedRows;
        });
        total += deleted;
        if (deleted < batchSize) return total;
      }
    },
  };
}
