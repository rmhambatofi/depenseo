// Gestionnaire `notify` (F-NOT-01, F-NOT-04, F-NOT-05, ADR-035) : plage de silence (report à sa
// fin) et notifications devenues sans objet. Cas général : `notify-handler.spec`.
// Plage d'horloge : juin 2025 ; comptes sans connexion (cf. `tokens.spec`).
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { expense, job, notebook } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { updateNotificationSettings } from '../../src/notifications/notification-settings.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { NOON, notifyFixtures, type Payload, STAMP } from '../support/notify-fixtures.js';
import { FakePushSender } from '../support/push.js';

describe('gestionnaire notify', () => {
  const { pool, db } = testDb(2);
  const clock = new FakeClock(NOON);
  let push: FakePushSender;
  const { handle, account, addDevice, addExpense, addOccurrence } = notifyFixtures({
    db,
    clock,
    push: () => push,
  });

  beforeEach(() => {
    push = new FakePushSender();
    clock.set(NOON);
  });
  afterAll(async () => {
    await pool.promise().end();
  });

  describe('plage de silence 22:00–07:00 dans le fuseau du compte', () => {
    const deferred = async (jobId: string) =>
      db
        .select({ runAt: job.runAt, payload: job.payload, status: job.status })
        .from(job)
        .where(eq(job.uniqueKey, `deferred:${jobId}`));

    it.each([
      // 23:30 locales le 10 juin 2025 (heure d'été) → 07:00 locales le 11.
      ['Europe/Paris', Date.UTC(2025, 5, 10, 21, 30), '2025-06-11T05:00:00.000Z'],
      ['Europe/Lisbon', Date.UTC(2025, 5, 10, 22, 30), '2025-06-11T06:00:00.000Z'],
      ['America/Montreal', Date.UTC(2025, 5, 11, 3, 30), '2025-06-11T11:00:00.000Z'],
      ['Indian/Reunion', Date.UTC(2025, 5, 10, 19, 30), '2025-06-11T03:00:00.000Z'],
    ])('%s : 23:30 locales → reportée à 07:00 locales', async (timeZone, now, expected) => {
      const t = await account({ timeZone });
      const token = await addDevice(t.id);
      await updateNotificationSettings(
        db,
        t.id,
        { quietHours: { start: '22:00', end: '07:00' } },
        STAMP,
      );
      clock.set(now);
      const jobId = newId();
      const expenseId = await addExpense(t.notebookId);
      const payload: Payload = { kind: 'unusual_expense', notebookId: t.notebookId, expenseId };
      await handle(payload, jobId);
      expect(push.to(token)).toEqual([]);
      const [copy] = await deferred(jobId);
      expect(copy).toMatchObject({ status: 'pending' });
      expect(copy!.runAt.toISOString()).toBe(expected);
      expect(JSON.parse(copy!.payload)).toEqual(payload);
      // À la fin de la plage, la copie part.
      clock.set(copy!.runAt.getTime());
      const copyId = newId();
      await handle(payload, copyId);
      expect(push.to(token)).toHaveLength(1);
      expect(await deferred(copyId)).toEqual([]);
    });

    it('hors plage (21:59 locales) : envoi immédiat', async () => {
      const t = await account({ timeZone: 'Europe/Paris' });
      const token = await addDevice(t.id);
      await updateNotificationSettings(
        db,
        t.id,
        { quietHours: { start: '22:00', end: '07:00' } },
        STAMP,
      );
      clock.set(Date.UTC(2025, 5, 10, 19, 59));
      const jobId = newId();
      await handle({ kind: 'daily_reminder', userId: t.id, date: '2025-06-10' }, jobId);
      expect(push.to(token)).toHaveLength(1);
      expect(await deferred(jobId)).toEqual([]);
    });
  });

  describe('notification devenue sans objet', () => {
    it('dépense supprimée entre-temps', async () => {
      const t = await account();
      const token = await addDevice(t.id);
      const expenseId = await addExpense(t.notebookId);
      await db.update(expense).set({ deletedAt: STAMP }).where(eq(expense.id, expenseId));
      await handle({ kind: 'unusual_expense', notebookId: t.notebookId, expenseId });
      expect(push.to(token)).toEqual([]);
    });

    it.each(['paid', 'skipped'] as const)('échéance %s entre-temps', async (status) => {
      const t = await account();
      const token = await addDevice(t.id);
      const occurrenceId = await addOccurrence(t.notebookId, { status });
      await handle({ kind: 'occurrence_due', notebookId: t.notebookId, occurrenceId });
      await handle({
        kind: 'occurrence_reminder',
        notebookId: t.notebookId,
        occurrenceId,
        reminder: 'three_days_before',
      });
      expect(push.to(token)).toEqual([]);
    });

    it('carnet supprimé', async () => {
      const t = await account();
      const token = await addDevice(t.id);
      const expenseId = await addExpense(t.notebookId);
      await db.update(notebook).set({ deletedAt: STAMP }).where(eq(notebook.id, t.notebookId));
      await handle({ kind: 'unusual_expense', notebookId: t.notebookId, expenseId });
      expect(push.to(token)).toEqual([]);
    });

    it('identifiant d’un autre carnet : rien', async () => {
      const t = await account();
      const other = await account();
      const token = await addDevice(t.id);
      const expenseId = await addExpense(other.notebookId);
      await handle({ kind: 'unusual_expense', notebookId: t.notebookId, expenseId });
      expect(push.to(token)).toEqual([]);
    });

    it('alerte de limite d’une période close (mai) traitée en juin : rien', async () => {
      const t = await account();
      const token = await addDevice(t.id);
      await handle({
        kind: 'limit',
        notebookId: t.notebookId,
        periodStart: '2025-05-01',
        threshold: 80,
      });
      expect(push.to(token)).toEqual([]);
      await handle({
        kind: 'limit',
        notebookId: t.notebookId,
        periodStart: '2025-06-01',
        threshold: 80,
      });
      expect(push.to(token)).toHaveLength(1);
    });
  });
});
