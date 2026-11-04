// §8.2 : tâche créée dans la transaction de la donnée, clé d'unicité, charge utile sans PII.
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withTransaction } from '../../src/db/transaction.js';
import { newId } from '../../src/db/uuid.js';
import {
  JobPayloadError,
  JobQueue,
  MAX_PAYLOAD_BYTES,
  defineJob,
} from '../../src/jobs/job-queue.js';
import { FakeClock } from '../support/clock.js';
import { jobsOfType, testDb, testJob } from '../support/jobs.js';

const { pool, db } = testDb();
const clock = new FakeClock();
const queue = new JobQueue(clock);

afterAll(async () => {
  await pool.promise().end();
});

describe('JobQueue.enqueue', () => {
  it('écrit une tâche en attente, due maintenant par défaut', async () => {
    const def = testJob();
    const ref = newId();
    const result = await withTransaction(db, (tx) => queue.enqueue(tx, def, { ref }));
    expect(result.created).toBe(true);
    const [row] = await jobsOfType(db, def.type);
    expect(row).toMatchObject({ status: 'pending', attempts: 0, uniqueKey: null });
    expect(row!.id).toBe(result.id);
    expect(JSON.parse(row!.payload)).toEqual({ ref });
    expect(row!.runAt.getTime()).toBe(clock.now().getTime());
    expect(row!.createdAt.getTime()).toBe(clock.now().getTime());
  });

  it('accepte une échéance explicite', async () => {
    const def = testJob();
    const runAt = new Date(clock.now().getTime() + 3_600_000);
    await withTransaction(db, (tx) => queue.enqueue(tx, def, { ref: newId() }, { runAt }));
    const [row] = await jobsOfType(db, def.type);
    expect(row!.runAt.getTime()).toBe(runAt.getTime());
  });

  it('disparaît avec la transaction de la donnée si elle est annulée', async () => {
    const def = testJob();
    await expect(
      withTransaction(db, async (tx) => {
        await queue.enqueue(tx, def, { ref: newId() });
        throw new Error('annulation');
      }),
    ).rejects.toThrow('annulation');
    expect(await jobsOfType(db, def.type)).toHaveLength(0);
  });

  it('respecte la clé d’unicité : un second ajout ne crée rien et renvoie la tâche existante', async () => {
    const def = testJob();
    const uniqueKey = `occurrence:${newId()}`;
    const first = await withTransaction(db, (tx) =>
      queue.enqueue(tx, def, { ref: newId() }, { uniqueKey }),
    );
    const second = await withTransaction(db, (tx) =>
      queue.enqueue(tx, def, { ref: newId() }, { uniqueKey }),
    );
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(await jobsOfType(db, def.type)).toHaveLength(1);
  });

  it('rejette une charge utile hors schéma (clé inconnue, type faux)', async () => {
    const def = testJob();
    await expect(
      db.transaction((tx) => queue.enqueue(tx, def, { ref: newId(), extra: 1 } as never)),
    ).rejects.toBeInstanceOf(JobPayloadError);
    await expect(
      db.transaction((tx) => queue.enqueue(tx, def, { ref: 'pas-un-uuid' })),
    ).rejects.toBeInstanceOf(JobPayloadError);
    expect(await jobsOfType(db, def.type)).toHaveLength(0);
  });

  it('rejette toute donnée personnelle, même si le schéma de la tâche l’accepterait', async () => {
    const loose = defineJob(`test.${newId()}`, z.record(z.string(), z.unknown()));
    const leaks = [
      { email: 'x' },
      { to: 'alice@example.fr' },
      { nested: { list: ['ok', 'bob@example.org'] } },
      { amountCents: 1250 },
      { note: 'loyer' },
      { resetToken: 'abc' },
    ];
    for (const payload of leaks) {
      const error = await db
        .transaction((tx) => queue.enqueue(tx, loose, payload))
        .catch((e: unknown) => e);
      expect(error, JSON.stringify(Object.keys(payload))).toBeInstanceOf(JobPayloadError);
      // Le message ne recopie jamais la valeur fautive.
      expect((error as Error).message).not.toMatch(/example|loyer|abc/);
    }
    expect(await jobsOfType(db, loose.type)).toHaveLength(0);
  });

  it('rejette une charge utile trop volumineuse', async () => {
    const big = defineJob(`test.${newId()}`, z.strictObject({ ids: z.array(z.uuid()) }));
    const ids = Array.from({ length: Math.ceil(MAX_PAYLOAD_BYTES / 38) + 1 }, () => newId());
    await expect(db.transaction((tx) => queue.enqueue(tx, big, { ids }))).rejects.toBeInstanceOf(
      JobPayloadError,
    );
    expect(await jobsOfType(db, big.type)).toHaveLength(0);
  });
});
