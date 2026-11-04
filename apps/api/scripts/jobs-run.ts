// `pnpm --filter api jobs:run` : passage cron de la file de tâches (§8.2), lancé chaque minute
// par la crontab o2switch (pas de processus permanent sous Passenger). Durée totale ≤ 50 s.
// Variables : DATABASE_URL (compte API), DB_POOL_SIZE, LOG_LEVEL.
import { pino } from 'pino';
import { systemClock } from '../src/clock.js';
import { loadWorkerConfig } from '../src/config/env.js';
import { createDatabase, createDbPool } from '../src/db/connection.js';
import { RUN_DEADLINE_MS, runJobs } from '../src/jobs/job-runner.js';
import { jobHandlers, scheduledTasks } from '../src/jobs/registry.js';
import { runScheduledTasks } from '../src/jobs/scheduler.js';
import { describeError } from '../src/logging/redact.js';

const startedAt = Date.now();
const config = loadWorkerConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL, base: { process: 'jobs-run' } });
const pool = createDbPool(config, {
  onSessionError: ({ code, errno }) =>
    logger.error({ code, errno }, 'database session initialisation failed'),
});
const db = createDatabase(pool);

let exitCode = 0;
try {
  const schedule = await runScheduledTasks(pool, systemClock, scheduledTasks());
  logger.info(schedule, 'scheduled tasks');
  const summary = await runJobs({
    db,
    clock: systemClock,
    logger,
    handlers: jobHandlers(),
    deadlineMs: RUN_DEADLINE_MS - (Date.now() - startedAt),
  });
  logger.info(summary, 'jobs run finished');
} catch (error) {
  exitCode = 1;
  logger.error({ err: describeError(error as Error) }, 'jobs run failed');
} finally {
  await pool.promise().end();
}
process.exit(exitCode);
