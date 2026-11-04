// Purge périodique des jetons de rafraîchissement expirés (ADR-018). Un jeton expiré ne sert plus :
// le présenter donne 401 qu'il soit en base ou non ; seule la révocation de famille sur
// réutilisation est perdue, sans objet puisque ses successeurs ont leur propre échéance.
import { lt } from 'drizzle-orm';
import { refreshToken } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { PURGE_BATCH, type ScheduledTask } from '../jobs/scheduler.js';

export function purgeExpiredRefreshTokens(batchSize = PURGE_BATCH): ScheduledTask {
  return {
    name: 'purge-expired-refresh-tokens',
    async run(db, now) {
      let total = 0;
      for (;;) {
        // Transaction relancée sur interblocage (1213/1205) : la purge parcourt l'index des
        // échéances, la révocation de famille celui des familles ; un échec bloquerait le passage.
        const deleted = await withTransaction(db, async (tx) => {
          const [result] = await tx
            .delete(refreshToken)
            .where(lt(refreshToken.expiresAt, now))
            .limit(batchSize);
          return result.affectedRows;
        });
        total += deleted;
        if (deleted < batchSize) return total;
      }
    },
  };
}
