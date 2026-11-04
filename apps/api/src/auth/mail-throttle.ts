// Programmation d'un e-mail transactionnel par compte, plafonnée par heure glissante (ADR-017).
import { and, gt, like } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { job } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';
import { type JobDefinition, JobQueue } from '../jobs/job-queue.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const HOUR_MS = 3_600_000;

/**
 * Programme `definition` pour `userId`, sauf si un envoi est déjà en attente (il tirera son jeton
 * au moment de l'envoi) ou si `perHour` envois ont été programmés dans l'heure. La clé d'unicité
 * `<prefix><userId>:<id>` sert d'index pour retrouver les envois du compte. L'appelant doit tenir
 * un verrou exclusif sur la ligne `user` (upsert ou `FOR UPDATE`) : sinon deux appels simultanés
 * lisent tous deux « rien en attente » et programment chacun un envoi.
 */
export async function scheduleThrottledMail(
  tx: Tx,
  clock: Clock,
  definition: JobDefinition<{ userId: string }>,
  options: { prefix: string; userId: string; perHour: number },
): Promise<void> {
  const now = clock.now();
  const keyPrefix = `${options.prefix}${options.userId}:`;
  const recent = await tx
    .select({ status: job.status })
    .from(job)
    .where(
      and(
        like(job.uniqueKey, `${keyPrefix}%`),
        gt(job.createdAt, new Date(now.getTime() - HOUR_MS)),
      ),
    );
  if (recent.some((row) => row.status === 'pending')) return;
  if (recent.length >= options.perHour) return;
  await new JobQueue(clock).enqueue(
    tx,
    definition,
    { userId: options.userId },
    { uniqueKey: `${keyPrefix}${newId()}` },
  );
}
