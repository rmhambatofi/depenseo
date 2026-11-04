// Outils communs aux suites de la file de tâches.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDatabase, createDbPool } from '../../src/db/connection.js';
import { job } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { defineJob } from '../../src/jobs/job-queue.js';
import { TEST_DATABASE_URL } from './db.js';

export function testDb(poolSize = 4) {
  const pool = createDbPool({ DATABASE_URL: TEST_DATABASE_URL, DB_POOL_SIZE: poolSize });
  return { pool, db: createDatabase(pool) };
}

/** Type de tâche propre au test : le moteur ne réclame que les types qu'il sait traiter. */
export function testJob() {
  return defineJob(`test.${newId()}`, z.strictObject({ ref: z.uuid() }));
}

export async function jobsOfType(db: ReturnType<typeof createDatabase>, type: string) {
  return db.select().from(job).where(eq(job.type, type));
}

export const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };
