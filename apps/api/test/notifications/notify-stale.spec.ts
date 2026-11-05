// Gestionnaire `notify`, cas périmés (ADR-035) : rappel quotidien reporté au lendemain par la plage
// de silence → abandonné ; jeton refusé alors que l'appareil s'est réenregistré → appareil conservé.
// Plage d'horloge : juin 2025 (cf. `notify-handler.spec`).
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { device } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { notifyHandler } from '../../src/notifications/notify.handler.js';
import type { PushResult, PushTarget } from '../../src/notifications/push-sender.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { FakePushSender, insertDevice } from '../support/push.js';
import { createUser } from '../support/users.js';

describe('notify : cas périmés', () => {
  const { pool, db } = testDb(2);
  // Mercredi 11 juin 2025, 07:00 à Paris : fin d'une plage 22:00–07:00 commencée la veille.
  const MORNING = Date.UTC(2025, 5, 11, 5, 0, 0);
  const STAMP = new Date(Date.UTC(2025, 5, 1));
  const clock = new FakeClock(MORNING);
  const signal = new AbortController().signal;

  beforeEach(() => clock.set(MORNING));
  afterAll(async () => {
    await pool.promise().end();
  });

  it('rappel quotidien de la veille (reporté par la plage de silence) → rien envoyé', async () => {
    const push = new FakePushSender();
    const t = await createUser(db, STAMP);
    const token = await insertDevice(db, t.id, 'ios', STAMP);
    const handle = (date: string) =>
      notifyHandler({ db, clock, push }).handle(
        { kind: 'daily_reminder', userId: t.id, date },
        { jobId: newId(), attempt: 1, signal },
      );
    await handle('2025-06-10');
    expect(push.to(token)).toEqual([]);
    await handle('2025-06-11');
    expect(push.to(token)).toHaveLength(1);
  });

  it('jeton refusé mais appareil réenregistré entre-temps → nouveau jeton conservé', async () => {
    const t = await createUser(db, STAMP);
    const oldToken = await insertDevice(db, t.id, 'ios', STAMP);
    const [row] = await db
      .select({ id: device.id })
      .from(device)
      .where(eq(device.pushToken, oldToken));
    const newToken = `tok-${newId()}`;
    // Le service refuse l'ancien jeton pendant que l'application en enregistre un nouveau.
    const push = {
      async send(target: PushTarget): Promise<PushResult> {
        await db.update(device).set({ pushToken: newToken }).where(eq(device.id, row!.id));
        return target.token === oldToken ? 'invalid_token' : 'sent';
      },
    };
    await notifyHandler({ db, clock, push }).handle(
      { kind: 'daily_reminder', userId: t.id, date: '2025-06-11' },
      { jobId: newId(), attempt: 1, signal },
    );
    const rows = await db
      .select({ token: device.pushToken })
      .from(device)
      .where(eq(device.id, row!.id));
    expect(rows).toEqual([{ token: newToken }]);
  });
});
