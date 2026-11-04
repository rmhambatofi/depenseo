// Alertes de limite (F-LIM-04, F-NOT-01, ADR-004, ADR-029) : après chaque écriture de dépense, dans
// la même transaction (carnet verrouillé), la période en cours est recalculée ; si elle atteint un
// seuil plus haut que le dernier notifié, une tâche `notify` est créée. La charge utile ne porte
// que des identifiants et le seuil : jamais de montant (ADR-003).
import { todayIn } from '@depenseo/shared';
import { and, eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import type { Tx } from '../auth/session.service.js';
import type { Clock } from '../clock.js';
import { limitAlert, user } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';
import { defineJob, JobQueue } from '../jobs/job-queue.js';
import { dayTotals } from './day-totals.js';
import { globalLimitVersions } from './limits.service.js';
import { periodSlices, summarize } from './period-summary.js';

/** Premier seuil, puis 100 % et chaque tranche de `ALERT_STEP` points au-delà (ADR-004). */
export const FIRST_ALERT_PERCENT = 80;
export const ALERT_STEP = 10;
/** Dernier seuil notifié (ADR-029) : au-delà, plus d'alerte dans la période (au plus 12). */
export const MAX_ALERT_PERCENT = 200;

/**
 * Notifications à envoyer (gestionnaire : P4-04, push sans montant). Union discriminée par `kind`
 * pour accueillir les autres notifications (dépense inhabituelle P3-04, échéances P4).
 */
export const NOTIFY = defineJob(
  'notify',
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('limit'),
      notebookId: z.uuid(),
      periodStart: z.iso.date(),
      threshold: z.number().int().min(FIRST_ALERT_PERCENT).max(MAX_ALERT_PERCENT),
    }),
  ]),
);

/** Plus haut seuil atteint pour un pourcentage consommé (plancher), `null` sous 80 %, ≤ 200. */
export function thresholdReached(percent: number | null): number | null {
  if (percent === null || percent < FIRST_ALERT_PERCENT) return null;
  if (percent < 100) return FIRST_ALERT_PERCENT;
  return Math.min(MAX_ALERT_PERCENT, 100 + Math.floor((percent - 100) / ALERT_STEP) * ALERT_STEP);
}

/**
 * Détecte le franchissement d'un seuil de la limite globale sur la période en cours (« aujourd'hui »
 * dans le fuseau du compte `userId`, auteur de l'écriture). L'appelant tient le verrou du carnet.
 * Ne signale que le seuil le plus haut atteint, et seulement s'il dépasse le dernier notifié pour
 * cette période : un retour sous un seuil puis un nouveau franchissement n'alerte pas deux fois.
 */
export async function checkLimitAlert(
  tx: Tx,
  clock: Clock,
  notebookId: string,
  userId: string,
): Promise<number | null> {
  const [account] = await tx
    .select({ timeZone: user.timeZone, currency: user.currency })
    .from(user)
    .where(eq(user.id, userId));
  if (!account) return null;
  const now = clock.now();
  const today = todayIn(
    account.timeZone,
    Temporal.Instant.fromEpochMilliseconds(now.getTime()),
  ).toString();
  const versions = await globalLimitVersions(tx, notebookId);
  const [slice] = periodSlices(versions, today, 1);
  if (!slice?.version?.amount) return null;
  const totals = await dayTotals(tx, notebookId, slice.start, slice.end);
  const threshold = thresholdReached(
    summarize(slice, today, totals, account.currency).consumedPercent,
  );
  if (threshold === null) return null;

  const where = and(eq(limitAlert.notebookId, notebookId), eq(limitAlert.periodStart, slice.start));
  const [previous] = await tx
    .select({ threshold: limitAlert.threshold })
    .from(limitAlert)
    .where(where);
  if (previous && previous.threshold >= threshold) return null;
  if (previous) {
    await tx.update(limitAlert).set({ threshold, updatedAt: now }).where(where);
  } else {
    await tx.insert(limitAlert).values({
      id: newId(),
      notebookId,
      periodStart: slice.start,
      threshold,
      createdAt: now,
      updatedAt: now,
    });
  }
  await new JobQueue(clock).enqueue(
    tx,
    NOTIFY,
    { kind: 'limit', notebookId, periodStart: slice.start, threshold },
    { uniqueKey: `limit:${notebookId}:${slice.start}:${threshold}` },
  );
  return threshold;
}
