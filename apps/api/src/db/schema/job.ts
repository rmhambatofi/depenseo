// File de tâches de fond (§8.2) : alimentée dans la transaction de la donnée, vidée par cron (P1-04).
import { index, int, mysqlTable, text, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { primaryId, timestamps, utcDateTime } from './columns.js';

export const JOB_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const job = mysqlTable(
  'job',
  {
    id: primaryId(),
    type: varchar('type', { length: 64 }).notNull(),
    /** JSON validé par zod côté application ; TEXT et non JSON (collation utf8mb4_bin sous MariaDB). */
    payload: text('payload').notNull(),
    status: varchar('status', { length: 16 }).$type<JobStatus>().notNull().default('pending'),
    runAt: utcDateTime('run_at').notNull(),
    attempts: int('attempts', { unsigned: true }).notNull().default(0),
    /** Clé d'idempotence (ex. `occurrence:<id>`) ; NULL autorisé plusieurs fois. */
    uniqueKey: varchar('unique_key', { length: 191 }),
    lockedUntil: utcDateTime('locked_until'),
    /** Code d'erreur court, jamais un message contenant des données. */
    lastError: varchar('last_error', { length: 255 }),
    finishedAt: utcDateTime('finished_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('job_unique_key_uq').on(t.uniqueKey),
    index('job_status_run_idx').on(t.status, t.runAt),
  ],
);
