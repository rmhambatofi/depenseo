// Traitement de la file (§8.2) : un passage cron par minute traite les tâches dues pendant 50 s
// au plus. Chaque tâche est réclamée par `SELECT … FOR UPDATE SKIP LOCKED` dans une courte
// transaction (bail `locked_until`), puis exécutée hors transaction. Plusieurs passages peuvent
// se chevaucher sans traiter deux fois la même tâche.
import { and, eq, inArray, lt, lte } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { job } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { JobPayloadError, parsePayload, type JobDefinition } from './job-queue.js';

export const MAX_ATTEMPTS = 5;
/** Durée d'un passage cron, réclamations et exécutions comprises. */
export const RUN_DEADLINE_MS = 50_000;
/** Durée maximale d'un gestionnaire, bornée en plus par le temps restant du passage. */
export const HANDLER_TIMEOUT_MS = 30_000;
/** Pas de nouvelle réclamation s'il reste moins que ce temps avant l'échéance du passage. */
export const MIN_HANDLER_BUDGET_MS = 10_000;
/**
 * Bail d'une tâche réclamée, largement supérieur à `HANDLER_TIMEOUT_MS` : au-delà, le worker est
 * présumé mort et la tâche reprise.
 */
export const LEASE_MS = 5 * 60_000;
const RETRY_BASE_MS = 60_000;

/** Délai avant la tentative suivant l'échec n° `attempt` : 1, 2, 4 puis 8 min. */
export function retryDelayMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** (attempt - 1);
}

export interface JobContext {
  jobId: string;
  /** Numéro de la tentative en cours, à partir de 1. */
  attempt: number;
  /** Déclenché à l'expiration du délai du gestionnaire : arrêter le travail en cours. */
  signal: AbortSignal;
}

export interface JobHandler<P> {
  definition: JobDefinition<P>;
  /** Doit être idempotent : une tâche reprise après un bail expiré peut être rejouée. */
  handle(payload: P, context: JobContext): Promise<void>;
}

/** Sous-ensemble de pino : objets de champs sans donnée personnelle, puis message fixe. */
export interface JobLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

export interface RunJobsOptions {
  db: Database;
  clock: Clock;
  logger: JobLogger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registre hétérogène
  handlers: readonly JobHandler<any>[];
  deadlineMs?: number;
  handlerTimeoutMs?: number;
  /** Tests seulement : seuil de temps restant en dessous duquel rien n'est réclamé. */
  minHandlerBudgetMs?: number;
}

export interface RunSummary {
  succeeded: number;
  retried: number;
  failed: number;
  /** Clôtures écartées : la tâche avait été reprise par un autre worker (bail expiré). */
  stale: number;
}

interface Claimed {
  id: string;
  type: string;
  payload: string;
  attempts: number;
}

/** Code court pour `last_error` et les journaux : jamais le message (il peut contenir des PII). */
export function errorCode(error: unknown): string {
  if (error instanceof JobPayloadError) return 'invalid_payload';
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(code)) return code;
  if (error instanceof Error && /^[A-Za-z0-9_]{1,64}$/.test(error.name)) return error.name;
  return 'unknown';
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Tâche due la plus ancienne, verrouillée, en sautant celles que d'autres workers réclament.
 * Requête sans `OR` ni tri hors index : `(status, run_at)` est parcouru dans l'ordre et seule la
 * ligne retenue est verrouillée (sinon InnoDB verrouille toutes les lignes dues avant de trier
 * et un second worker ne trouve plus rien).
 */
export function selectDuePending(tx: Tx, types: string[], now: Date) {
  return tx
    .select({ id: job.id, type: job.type, payload: job.payload, attempts: job.attempts })
    .from(job)
    .where(and(eq(job.status, 'pending'), lte(job.runAt, now), inArray(job.type, types)))
    .orderBy(job.runAt, job.id)
    .limit(1)
    .for('update', { skipLocked: true });
}

/** Tâche `running` dont le bail a expiré (worker interrompu), par l'index `(status, locked_until)`. */
function selectExpiredLease(tx: Tx, types: string[], now: Date) {
  return tx
    .select({ id: job.id, type: job.type, payload: job.payload, attempts: job.attempts })
    .from(job)
    .where(and(eq(job.status, 'running'), lt(job.lockedUntil, now), inArray(job.type, types)))
    .orderBy(job.lockedUntil, job.id)
    .limit(1)
    .for('update', { skipLocked: true });
}

type Claim = { kind: 'claimed'; job: Claimed } | { kind: 'exhausted'; job: Claimed };

async function claimNext(db: Database, types: string[], now: Date): Promise<Claim | undefined> {
  return withTransaction(db, async (tx) => {
    const [expired] = await selectExpiredLease(tx, types, now);
    const row = expired ?? (await selectDuePending(tx, types, now))[0];
    if (!row) return undefined;
    if (row.attempts >= MAX_ATTEMPTS) {
      // Bail expiré au dernier essai : échec définitif sans nouvelle exécution.
      await tx
        .update(job)
        .set({
          status: 'failed',
          lockedUntil: null,
          lastError: 'lease_expired',
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(job.id, row.id));
      return { kind: 'exhausted', job: row };
    }
    const attempts = row.attempts + 1;
    await tx
      .update(job)
      .set({
        status: 'running',
        attempts,
        lockedUntil: new Date(now.getTime() + LEASE_MS),
        updatedAt: now,
      })
      .where(eq(job.id, row.id));
    return { kind: 'claimed', job: { ...row, attempts } };
  });
}

/**
 * Clôture d'une tentative. La garde `attempts` écarte un worker dont le bail a expiré et dont la
 * tâche a été reprise par un autre entre-temps. Renvoie `false` si la clôture a été écartée.
 */
async function settle(
  db: Database,
  claimed: Claimed,
  values: Partial<typeof job.$inferInsert>,
): Promise<boolean> {
  const [result] = await withTransaction(db, (tx) =>
    tx
      .update(job)
      .set({ lockedUntil: null, ...values })
      .where(
        and(eq(job.id, claimed.id), eq(job.status, 'running'), eq(job.attempts, claimed.attempts)),
      ),
  );
  return result.affectedRows === 1;
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new JobPayloadError('Charge utile illisible');
  }
}

/** Exécute le gestionnaire avec un délai maximal ; à l'expiration, `signal` est déclenché. */
async function runWithTimeout(
  run: (signal: AbortSignal) => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Rejet avant l'abandon : un gestionnaire qui se termine sur `abort` reste un dépassement.
      reject(
        Object.assign(new Error('Délai du gestionnaire dépassé'), { code: 'handler_timeout' }),
      );
      controller.abort();
    }, timeoutMs);
  });
  try {
    await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runJobs(options: RunJobsOptions): Promise<RunSummary> {
  const {
    db,
    clock,
    logger,
    deadlineMs = RUN_DEADLINE_MS,
    handlerTimeoutMs = HANDLER_TIMEOUT_MS,
    minHandlerBudgetMs = MIN_HANDLER_BUDGET_MS,
  } = options;
  const handlers = new Map(options.handlers.map((h) => [h.definition.type, h]));
  const summary: RunSummary = { succeeded: 0, retried: 0, failed: 0, stale: 0 };
  if (handlers.size === 0) return summary;
  const types = [...handlers.keys()];
  const start = clock.now().getTime();
  const remaining = () => deadlineMs - (clock.now().getTime() - start);

  while (remaining() >= minHandlerBudgetMs) {
    const claim = await claimNext(db, types, clock.now());
    if (!claim) break;
    const claimed = claim.job;
    const fields = { jobId: claimed.id, type: claimed.type, attempt: claimed.attempts };
    if (claim.kind === 'exhausted') {
      summary.failed += 1;
      logger.error({ ...fields, code: 'lease_expired' }, 'job failed');
      continue;
    }
    const handler = handlers.get(claimed.type)!;
    let outcome: Partial<typeof job.$inferInsert>;
    let code: string | undefined;
    try {
      const payload: unknown = parsePayload(handler.definition, readJson(claimed.payload));
      await runWithTimeout(
        (signal) =>
          handler.handle(payload, { jobId: claimed.id, attempt: claimed.attempts, signal }),
        Math.min(handlerTimeoutMs, Math.max(remaining(), 1)),
      );
      outcome = { status: 'done', finishedAt: clock.now(), lastError: null };
    } catch (error) {
      code = errorCode(error);
      const now = clock.now();
      // Charge utile illisible ou essais épuisés : nouvelle tentative inutile.
      outcome =
        code === 'invalid_payload' || claimed.attempts >= MAX_ATTEMPTS
          ? { status: 'failed', finishedAt: now, lastError: code }
          : {
              status: 'pending',
              runAt: new Date(now.getTime() + retryDelayMs(claimed.attempts)),
              lastError: code,
            };
    }
    if (!(await settle(db, claimed, { ...outcome, updatedAt: clock.now() }))) {
      summary.stale += 1;
      logger.warn(fields, 'job settle skipped: lease taken over');
    } else if (outcome.status === 'done') {
      summary.succeeded += 1;
      logger.info(fields, 'job done');
    } else if (outcome.status === 'failed') {
      summary.failed += 1;
      logger.error({ ...fields, code }, 'job failed');
    } else {
      summary.retried += 1;
      logger.warn({ ...fields, code }, 'job retry scheduled');
    }
  }
  return summary;
}
