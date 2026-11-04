// §8.2 : traitement par cron, SKIP LOCKED, nouvelle tentative à délai croissant, échec après 5 essais.
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { job } from '../../src/db/schema/index.js';
import { withTransaction } from '../../src/db/transaction.js';
import { newId } from '../../src/db/uuid.js';
import { JobQueue, type JobDefinition } from '../../src/jobs/job-queue.js';
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  retryDelayMs,
  runJobs,
  selectDuePending,
  type JobHandler,
} from '../../src/jobs/job-runner.js';
import { FakeClock } from '../support/clock.js';
import { jobsOfType, silentLogger, testDb, testJob } from '../support/jobs.js';

const { pool, db } = testDb();

afterAll(async () => {
  await pool.promise().end();
});

type Payload = { ref: string };

function handler(
  definition: JobDefinition<Payload>,
  handle: JobHandler<Payload>['handle'],
): JobHandler<Payload> {
  return { definition, handle };
}

async function enqueueMany(def: JobDefinition<Payload>, clock: FakeClock, count: number) {
  const queue = new JobQueue(clock);
  const refs = Array.from({ length: count }, () => newId());
  await withTransaction(db, async (tx) => {
    for (const ref of refs) await queue.enqueue(tx, def, { ref });
  });
  return refs;
}

function failingWith(code: string): Error {
  return Object.assign(new Error('échec avec alice@example.fr'), { code });
}

describe('runJobs', () => {
  it('traite les tâches dues et les marque terminées', async () => {
    const clock = new FakeClock();
    const def = testJob();
    const refs = await enqueueMany(def, clock, 3);
    const seen: string[] = [];
    const summary = await runJobs({
      db,
      clock,
      logger: silentLogger,
      handlers: [handler(def, (payload) => Promise.resolve(void seen.push(payload.ref)))],
    });
    expect(seen.sort()).toEqual([...refs].sort());
    expect(summary).toMatchObject({ succeeded: 3, retried: 0, failed: 0 });
    const rows = await jobsOfType(db, def.type);
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'done', attempts: 1, lockedUntil: null });
      expect(row.finishedAt?.getTime()).toBe(clock.now().getTime());
    }
  });

  it('ne réclame pas une tâche future ni un type sans gestionnaire', async () => {
    const clock = new FakeClock();
    const def = testJob();
    const other = testJob();
    const queue = new JobQueue(clock);
    await withTransaction(db, async (tx) => {
      await queue.enqueue(
        tx,
        def,
        { ref: newId() },
        { runAt: new Date(clock.now().getTime() + 1) },
      );
      await queue.enqueue(tx, other, { ref: newId() });
    });
    let calls = 0;
    await runJobs({
      db,
      clock,
      logger: silentLogger,
      handlers: [handler(def, () => Promise.resolve(void (calls += 1)))],
    });
    expect(calls).toBe(0);
    expect((await jobsOfType(db, other.type))[0]?.status).toBe('pending');
  });

  it('deux workers concurrents ne traitent jamais la même tâche', async () => {
    const clock = new FakeClock();
    const def = testJob();
    const refs = await enqueueMany(def, clock, 30);
    const second = testDb(2);
    const byWorker: string[][] = [[], []];
    const worker = (index: number, database: typeof db) =>
      runJobs({
        db: database,
        clock,
        logger: silentLogger,
        handlers: [
          handler(def, async (payload) => {
            byWorker[index]!.push(payload.ref);
            // Laisse l'autre worker réclamer pendant que celui-ci « travaille ».
            await new Promise((resolve) => setImmediate(resolve));
          }),
        ],
      });
    try {
      await Promise.all([worker(0, db), worker(1, second.db)]);
    } finally {
      await second.pool.promise().end();
    }
    const all = [...byWorker[0]!, ...byWorker[1]!];
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    expect(all.sort()).toEqual([...refs].sort());
    expect(byWorker[0]!.length).toBeGreaterThan(0);
    expect(byWorker[1]!.length).toBeGreaterThan(0);
    const rows = await jobsOfType(db, def.type);
    expect(rows.every((row) => row.status === 'done' && row.attempts === 1)).toBe(true);
  });

  it('replanifie un échec à délai croissant puis passe en échec après 5 essais', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 1);
    let calls = 0;
    const handlers = [
      handler(def, () => {
        calls += 1;
        return Promise.reject(failingWith('SMTP_DOWN'));
      }),
    ];
    const delays: number[] = [];
    // Valeur fixée par le §8.2, pas par la constante.
    expect(MAX_ATTEMPTS).toBe(5);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const before = clock.now().getTime();
      const summary = await runJobs({ db, clock, logger: silentLogger, handlers });
      const [row] = await jobsOfType(db, def.type);
      expect(row!.attempts).toBe(attempt);
      expect(row!.lastError).toBe('SMTP_DOWN');
      if (attempt < 5) {
        expect(summary.retried).toBe(1);
        expect(row!.status).toBe('pending');
        delays.push(row!.runAt.getTime() - before);
        // Pas encore dû : un nouveau passage immédiat ne fait rien.
        await runJobs({ db, clock, logger: silentLogger, handlers });
        expect(calls).toBe(attempt);
        clock.advance(row!.runAt.getTime() - before);
      } else {
        expect(summary.failed).toBe(1);
        expect(row).toMatchObject({ status: 'failed', lockedUntil: null });
        expect(row!.finishedAt?.getTime()).toBe(clock.now().getTime());
      }
    }
    expect(calls).toBe(5);
    expect(delays).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(delays).toEqual([1, 2, 3, 4].map(retryDelayMs));
    expect(delays[0]).toBeLessThan(delays[1]!);
    expect(delays[2]).toBeLessThan(delays[3]!);
  });

  it('ne journalise jamais le message d’erreur du gestionnaire ni la charge utile', async () => {
    const clock = new FakeClock();
    const def = testJob();
    const [ref] = await enqueueMany(def, clock, 1);
    const lines: string[] = [];
    const record = (obj: object, msg?: string) => void lines.push(JSON.stringify([obj, msg]));
    await runJobs({
      db,
      clock,
      logger: { info: record, warn: record, error: record },
      handlers: [handler(def, () => Promise.reject(failingWith('x'.repeat(300))))],
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toMatch(/alice|example/);
    expect(lines.join('\n')).not.toContain(ref);
    const [row] = await jobsOfType(db, def.type);
    // Code trop long ou exotique : seul le nom de la classe d'erreur est gardé.
    expect(row!.lastError).toBe('Error');
  });

  it('marque en échec, sans appeler le gestionnaire, une charge utile illisible en base', async () => {
    const clock = new FakeClock();
    const def = testJob();
    const now = clock.now();
    await db.insert(job).values({
      id: newId(),
      type: def.type,
      payload: '{"ref":"pas-un-uuid"}',
      runAt: now,
      createdAt: now,
      updatedAt: now,
    });
    let calls = 0;
    const summary = await runJobs({
      db,
      clock,
      logger: silentLogger,
      handlers: [handler(def, () => Promise.resolve(void (calls += 1)))],
    });
    expect(calls).toBe(0);
    expect(summary.failed).toBe(1);
    const [row] = await jobsOfType(db, def.type);
    expect(row).toMatchObject({ status: 'failed', lastError: 'invalid_payload' });
  });

  it('reprend une tâche dont le bail a expiré (worker interrompu)', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 1);
    const [row] = await jobsOfType(db, def.type);
    const id = row!.id;
    await db
      .update(job)
      .set({ status: 'running', attempts: 1, lockedUntil: new Date(clock.now().getTime() + 1000) })
      .where(eq(job.id, id));
    let calls = 0;
    const handlers = [handler(def, () => Promise.resolve(void (calls += 1)))];
    await runJobs({ db, clock, logger: silentLogger, handlers });
    expect(calls).toBe(0); // bail encore valide
    clock.advance(1001);
    await runJobs({ db, clock, logger: silentLogger, handlers });
    expect(calls).toBe(1);
    expect((await jobsOfType(db, def.type))[0]).toMatchObject({ status: 'done', attempts: 2 });
  });

  // Les délais des gestionnaires utilisent de vrais minuteurs : ici l'horloge simulée dépasse 50 s
  // (30 + 30), seul l'arrêt des réclamations est vérifié.
  it('s’arrête à l’échéance du passage cron (50 s) et laisse le reste au suivant', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 3);
    let calls = 0;
    const summary = await runJobs({
      db,
      clock,
      logger: silentLogger,
      handlers: [
        handler(def, () => {
          calls += 1;
          clock.advance(30_000);
          return Promise.resolve();
        }),
      ],
    });
    expect(calls).toBe(2);
    expect(summary.succeeded).toBe(2);
    const statuses = (await jobsOfType(db, def.type)).map((r) => r.status).sort();
    expect(statuses).toEqual(['done', 'done', 'pending']);
  });

  it('saute la tâche qu’un autre worker est en train de réclamer, sans l’attendre', async () => {
    const clock = new FakeClock();
    const def = testJob();
    const refs = await enqueueMany(def, clock, 5);
    const other = testDb(1);
    const seen: string[] = [];
    try {
      // Worker A : transaction de réclamation ouverte sur la plus ancienne tâche due.
      await other.db.transaction(async (tx) => {
        const [locked] = await selectDuePending(tx, [def.type], clock.now());
        expect(locked).toBeDefined();
        // Worker B : traite les 4 autres, ni bloqué ni arrêté par la ligne verrouillée.
        const summary = await runJobs({
          db,
          clock,
          logger: silentLogger,
          handlers: [handler(def, (p) => Promise.resolve(void seen.push(p.ref)))],
        });
        expect(summary.succeeded).toBe(4);
        expect(seen).not.toContain((JSON.parse(locked!.payload) as { ref: string }).ref);
      });
    } finally {
      await other.pool.promise().end();
    }
    expect(seen).toHaveLength(4);
    expect(refs).toEqual(expect.arrayContaining(seen));
  });

  it('écarte la clôture tardive d’un worker dont la tâche a été reprise', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 1);
    let calls = 0;
    let releaseB!: () => void;
    const gateB = new Promise<void>((resolve) => (releaseB = resolve));
    let markBStarted!: () => void;
    const bStarted = new Promise<void>((resolve) => (markBStarted = resolve));
    let inner: ReturnType<typeof runJobs> | undefined;
    const handlers = [
      handler(def, async () => {
        calls += 1;
        if (calls > 1) {
          // B : a repris la tâche et travaille encore quand A clôt.
          markBStarted();
          await gateB;
          return;
        }
        // A : son bail expire pendant qu'il travaille, B reprend la tâche (essai n° 2).
        clock.advance(LEASE_MS + 1);
        inner = runJobs({ db, clock, logger: silentLogger, handlers });
        await bStarted;
        // A échoue ensuite : sa clôture ne doit pas replanifier la tâche que B détient.
        throw failingWith('LATE');
      }),
    ];
    const outer = await runJobs({ db, clock, logger: silentLogger, handlers });
    expect(outer).toMatchObject({ succeeded: 0, retried: 0, stale: 1 });
    expect((await jobsOfType(db, def.type))[0]).toMatchObject({ status: 'running', attempts: 2 });
    releaseB();
    expect(await inner).toMatchObject({ succeeded: 1, stale: 0 });
    expect(calls).toBe(2);
    const [row] = await jobsOfType(db, def.type);
    expect(row).toMatchObject({ status: 'done', attempts: 2, lastError: null });
  });

  it('passe en échec une tâche dont le bail expire au 5e essai, sans la rejouer', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 1);
    const [row] = await jobsOfType(db, def.type);
    await db
      .update(job)
      .set({ status: 'running', attempts: 5, lockedUntil: new Date(clock.now().getTime() - 1) })
      .where(eq(job.id, row!.id));
    let calls = 0;
    const summary = await runJobs({
      db,
      clock,
      logger: silentLogger,
      handlers: [handler(def, () => Promise.resolve(void (calls += 1)))],
    });
    expect(calls).toBe(0);
    expect(summary.failed).toBe(1);
    expect((await jobsOfType(db, def.type))[0]).toMatchObject({
      status: 'failed',
      attempts: 5,
      lastError: 'lease_expired',
      lockedUntil: null,
    });
  });

  it('interrompt un gestionnaire trop long et replanifie la tâche', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 1);
    let aborted = false;
    const summary = await runJobs({
      db,
      clock,
      logger: silentLogger,
      handlerTimeoutMs: 20,
      handlers: [
        handler(
          def,
          (_payload, { signal }) =>
            new Promise((resolve) => {
              signal.addEventListener('abort', () => {
                aborted = true;
                resolve();
              });
            }),
        ),
      ],
    });
    expect(aborted).toBe(true);
    expect(summary.retried).toBe(1);
    expect((await jobsOfType(db, def.type))[0]).toMatchObject({
      status: 'pending',
      lastError: 'handler_timeout',
    });
  });

  it('ne réclame rien s’il reste moins de 10 s au passage (planification trop longue)', async () => {
    const clock = new FakeClock();
    const def = testJob();
    await enqueueMany(def, clock, 1);
    let calls = 0;
    const summary = await runJobs({
      db,
      clock,
      logger: silentLogger,
      deadlineMs: 9_999,
      handlers: [handler(def, () => Promise.resolve(void (calls += 1)))],
    });
    expect(calls).toBe(0);
    expect(summary).toEqual({ succeeded: 0, retried: 0, failed: 0, stale: 0 });
    expect((await jobsOfType(db, def.type))[0]).toMatchObject({ status: 'pending', attempts: 0 });
  });
});
