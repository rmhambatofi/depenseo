// §8.2 : planification sous GET_LOCK, purge des tâches terminées après 7 jours.
import { inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { job, type JobStatus } from '../../src/db/schema/job.js';
import { newId } from '../../src/db/uuid.js';
import {
  FINISHED_JOB_RETENTION_MS,
  purgeFinishedJobs,
  runScheduledTasks,
  scheduleLockName,
  type ScheduledTask,
} from '../../src/jobs/scheduler.js';
import { FakeClock } from '../support/clock.js';
import { TEST_DATABASE_URL } from '../support/db.js';
import { testDb } from '../support/jobs.js';

const LOCK = scheduleLockName(new URL(TEST_DATABASE_URL).pathname.slice(1));

const { pool, db } = testDb();

afterAll(async () => {
  await pool.promise().end();
});

function countingTask(): ScheduledTask & { calls: number } {
  return {
    name: 'compteur',
    calls: 0,
    run() {
      this.calls += 1;
      return Promise.resolve(0);
    },
  };
}

describe('scheduleLockName', () => {
  it('donne un nom propre à la base, de longueur fixe ≤ 64 (limite MySQL 8)', () => {
    const long = scheduleLockName('x'.repeat(64));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(scheduleLockName('a').length).toBe(long.length);
    expect(scheduleLockName('depenseo')).not.toBe(scheduleLockName('depenseo_test'));
  });
});

describe('runScheduledTasks', () => {
  it('exécute les tâches périodiques quand le verrou est libre, puis le rend', async () => {
    const task = countingTask();
    expect(await runScheduledTasks(pool, new FakeClock(), [task])).toEqual({
      ran: true,
      counts: { compteur: 0 },
      failures: {},
    });
    expect((await runScheduledTasks(pool, new FakeClock(), [task])).ran).toBe(true);
    expect(task.calls).toBe(2);
  });

  it('ne fait rien si un autre passage cron tient le verrou', async () => {
    const other = testDb(1);
    const holder = await other.pool.promise().getConnection();
    try {
      const [[held]] = await holder.query<({ ok: number } & import('mysql2').RowDataPacket)[]>(
        'SELECT GET_LOCK(?, 0) AS ok',
        [LOCK],
      );
      expect(held?.ok).toBe(1);
      const task = countingTask();
      expect(await runScheduledTasks(pool, new FakeClock(), [task])).toEqual({
        ran: false,
        counts: {},
        failures: {},
      });
      expect(task.calls).toBe(0);
      await holder.query('SELECT RELEASE_LOCK(?)', [LOCK]);
    } finally {
      holder.release();
      await other.pool.promise().end();
    }
    // Verrou rendu par l'autre passage : le suivant s'exécute.
    expect((await runScheduledTasks(pool, new FakeClock(), [countingTask()])).ran).toBe(true);
  });

  it('une tâche en échec est signalée sans empêcher les suivantes, et le verrou est rendu', async () => {
    const error = new Error('ko');
    const failing: ScheduledTask = { name: 'ko', run: () => Promise.reject(error) };
    const after = countingTask();
    expect(await runScheduledTasks(pool, new FakeClock(), [failing, after])).toEqual({
      ran: true,
      counts: { compteur: 0 },
      failures: { ko: error },
    });
    expect(after.calls).toBe(1);
    expect((await runScheduledTasks(pool, new FakeClock(), [countingTask()])).ran).toBe(true);
  });
});

describe('runScheduledTasks avec un pool d’une seule connexion', () => {
  it('exécute les tâches sur la connexion qui tient le verrou, sans attendre le pool', async () => {
    const single = testDb(1);
    try {
      const result = await runScheduledTasks(single.pool, new FakeClock(), [purgeFinishedJobs()]);
      expect(result.ran).toBe(true);
      // Le pool est de nouveau utilisable : la connexion a été rendue et le verrou relâché.
      expect((await runScheduledTasks(single.pool, new FakeClock(), [countingTask()])).ran).toBe(
        true,
      );
    } finally {
      await single.pool.promise().end();
    }
  }, 5_000);
});

describe('purgeFinishedJobs', () => {
  it('supprime les tâches terminées depuis plus de 7 jours, garde les récentes et les échecs', async () => {
    const clock = new FakeClock(Date.UTC(2031, 0, 1));
    const now = clock.now().getTime();
    const rows: { id: string; status: JobStatus; finishedAt: Date | null }[] = [
      { id: newId(), status: 'done', finishedAt: new Date(now - FINISHED_JOB_RETENTION_MS - 1) },
      { id: newId(), status: 'done', finishedAt: new Date(now - 9 * 86_400_000) },
      { id: newId(), status: 'done', finishedAt: new Date(now - FINISHED_JOB_RETENTION_MS + 1) },
      { id: newId(), status: 'failed', finishedAt: new Date(now - 30 * 86_400_000) },
      { id: newId(), status: 'pending', finishedAt: null },
    ];
    const created = new Date(now - 40 * 86_400_000);
    await db.insert(job).values(
      rows.map((row) => ({
        ...row,
        type: 'test.purge',
        payload: '{}',
        runAt: created,
        createdAt: created,
        updatedAt: created,
      })),
    );
    // Lots de 1 : la boucle de purge doit enchaîner plusieurs requêtes.
    const result = await runScheduledTasks(pool, clock, [purgeFinishedJobs(1)]);
    expect(result.counts['purge-finished-jobs']).toBeGreaterThanOrEqual(2);
    const left = await db
      .select({ id: job.id })
      .from(job)
      .where(
        inArray(
          job.id,
          rows.map((r) => r.id),
        ),
      );
    expect(left.map((r) => r.id).sort()).toEqual(
      rows
        .slice(2)
        .map((r) => r.id)
        .sort(),
    );
  });
});
