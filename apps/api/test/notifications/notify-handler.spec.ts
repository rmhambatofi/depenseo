// Gestionnaire `notify` (F-NOT-01, F-NOT-04, F-NOT-05, ADR-035) : destinataire, réglages par type,
// plage de silence (report à sa fin), notifications devenues sans objet, fusion du rappel « jour J »
// avec l'échéance à confirmer, appareils désinscrits, contenu sans montant.
// Plage d'horloge : juin 2025 ; comptes sans connexion (cf. `tokens.spec`).
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  category,
  device,
  expense,
  job,
  notebook,
  occurrence,
  recurringExpense,
  spendingLimit,
  user,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { jobHandlers } from '../../src/jobs/registry.js';
import { updateNotificationSettings } from '../../src/notifications/notification-settings.js';
import { notifyHandler } from '../../src/notifications/notify.handler.js';
import type { NOTIFY } from '../../src/notifications/notify-job.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { FakePushSender, insertDevice } from '../support/push.js';
import { createUser } from '../support/users.js';

type Payload = z.infer<typeof NOTIFY.payload>;

describe('gestionnaire notify', () => {
  const { pool, db } = testDb(2);
  // Mardi 10 juin 2025, 12:00 à Paris.
  const NOON = Date.UTC(2025, 5, 10, 10, 0, 0);
  const STAMP = new Date(Date.UTC(2025, 5, 1));
  const clock = new FakeClock(NOON);
  let push: FakePushSender;
  const handle = (payload: Payload, jobId = newId()) =>
    notifyHandler({ db, clock, push }).handle(payload, {
      jobId,
      attempt: 1,
      signal: new AbortController().signal,
    });

  beforeEach(() => {
    push = new FakePushSender();
    clock.set(NOON);
  });
  afterAll(async () => {
    await pool.promise().end();
  });

  async function account(opts: { language?: string; timeZone?: string } = {}) {
    const t = await createUser(db, STAMP);
    await db
      .update(user)
      .set({ language: opts.language ?? 'fr', timeZone: opts.timeZone ?? 'Europe/Paris' })
      .where(eq(user.id, t.id));
    return t;
  }

  const addDevice = (userId: string, platform: 'ios' | 'android' = 'ios') =>
    insertDevice(db, userId, platform, STAMP);

  async function leafCategory(notebookId: string) {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.notebookId, notebookId), sql`${category.parentId} is not null`))
      .limit(1);
    return row!.id;
  }

  async function addExpense(notebookId: string, amount = 123_456) {
    const id = newId();
    await db.insert(expense).values({
      id,
      notebookId,
      amount,
      currency: 'EUR',
      categoryId: await leafCategory(notebookId),
      spentOn: '2025-06-10',
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    return id;
  }

  async function addOccurrence(
    notebookId: string,
    opts: { status?: 'pending' | 'paid' | 'skipped'; requested?: boolean } = {},
  ) {
    const recurringId = newId();
    await db.insert(recurringExpense).values({
      id: recurringId,
      notebookId,
      name: 'Loyer 850 €',
      amount: 85_000,
      currency: 'EUR',
      amountKind: 'fixed',
      frequency: 'monthly',
      startDate: '2025-06-10',
      categoryId: await leafCategory(notebookId),
      mode: opts.requested ? 'confirm' : 'auto',
      generatedThrough: '2025-07-20',
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    const id = newId();
    await db.insert(occurrence).values({
      id,
      notebookId,
      recurringExpenseId: recurringId,
      dueDate: '2025-06-10',
      status: opts.status ?? 'pending',
      confirmationRequestedAt: opts.requested ? new Date(NOON - 3_600_000) : null,
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    return id;
  }

  it('envoie au propriétaire du carnet, dans sa langue, sur chacun de ses appareils', async () => {
    const t = await account({ language: 'en' });
    const ios = await addDevice(t.id, 'ios');
    const android = await addDevice(t.id, 'android');
    const expenseId = await addExpense(t.notebookId);
    await handle({ kind: 'unusual_expense', notebookId: t.notebookId, expenseId });
    expect(push.to(ios)).toEqual([
      {
        title: 'Unusual expense',
        body: expect.any(String) as unknown,
        data: { kind: 'unusual_expense', notebookId: t.notebookId, expenseId },
      },
    ]);
    expect(push.to(android)).toHaveLength(1);
  });

  it('aucun montant dans les charges utiles (dépense, échéance, limite)', async () => {
    const t = await account();
    const token = await addDevice(t.id);
    const expenseId = await addExpense(t.notebookId, 123_456);
    const occurrenceId = await addOccurrence(t.notebookId);
    await db.insert(spendingLimit).values({
      id: newId(),
      notebookId: t.notebookId,
      periodKind: 'month',
      startDay: 1,
      amount: 50_000,
      currency: 'EUR',
      includeRecurring: true,
      effectiveDate: '2025-06-01',
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    await handle({ kind: 'unusual_expense', notebookId: t.notebookId, expenseId });
    await handle({ kind: 'occurrence_due', notebookId: t.notebookId, occurrenceId });
    await handle({
      kind: 'limit',
      notebookId: t.notebookId,
      periodStart: '2025-06-01',
      threshold: 100,
    });
    const sent = push.to(token);
    expect(sent).toHaveLength(3);
    // Identifiants (UUID v7 aléatoires) retirés : « 500 » peut y figurer par hasard.
    const text = JSON.stringify(sent).replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<id>',
    );
    for (const forbidden of ['1234', '1 234', '850', '500', '€', 'EUR', 'Loyer']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it.each([
    ['limit', { limit: false }],
    ['unusualExpense', { unusualExpense: false }],
    ['occurrence', { occurrence: false }],
    ['dailyReminder', { dailyReminder: false }],
  ] as const)('type %s désactivé → rien n’est envoyé', async (_type, patch) => {
    const t = await account();
    const token = await addDevice(t.id);
    await updateNotificationSettings(db, t.id, patch, STAMP);
    const expenseId = await addExpense(t.notebookId);
    const occurrenceId = await addOccurrence(t.notebookId);
    await handle({ kind: 'unusual_expense', notebookId: t.notebookId, expenseId });
    await handle({ kind: 'occurrence_due', notebookId: t.notebookId, occurrenceId });
    await handle({
      kind: 'occurrence_reminder',
      notebookId: t.notebookId,
      occurrenceId,
      reminder: 'three_days_before',
    });
    await handle({ kind: 'daily_reminder', userId: t.id, date: '2025-06-10' });
    await handle({
      kind: 'limit',
      notebookId: t.notebookId,
      periodStart: '2025-06-01',
      threshold: 80,
    });
    const all = [
      'unusual_expense',
      'occurrence_due',
      'occurrence_reminder',
      'daily_reminder',
      'limit',
    ];
    const muted = {
      limit: ['limit'],
      unusualExpense: ['unusual_expense'],
      occurrence: ['occurrence_due', 'occurrence_reminder'],
      dailyReminder: ['daily_reminder'],
    }[_type];
    expect(push.to(token).map((m) => m.data.kind)).toEqual(all.filter((k) => !muted.includes(k)));
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

  it('fusion : rappel « jour J » d’une échéance déjà signalée à confirmer → un seul envoi', async () => {
    const t = await account();
    const token = await addDevice(t.id);
    const occurrenceId = await addOccurrence(t.notebookId, { requested: true });
    await handle({ kind: 'occurrence_due', notebookId: t.notebookId, occurrenceId });
    await handle({
      kind: 'occurrence_reminder',
      notebookId: t.notebookId,
      occurrenceId,
      reminder: 'due_date',
    });
    expect(push.to(token).map((m) => m.data.kind)).toEqual(['occurrence_due']);
    // Le rappel J-3 n'est pas concerné par la fusion.
    await handle({
      kind: 'occurrence_reminder',
      notebookId: t.notebookId,
      occurrenceId,
      reminder: 'three_days_before',
    });
    expect(push.to(token)).toHaveLength(2);
  });

  it('jeton refusé par le service → appareil supprimé, les autres servis', async () => {
    const t = await account();
    const stale = await addDevice(t.id);
    const ok = await addDevice(t.id, 'android');
    push.invalidTokens.add(stale);
    await handle({ kind: 'daily_reminder', userId: t.id, date: '2025-06-10' });
    expect(push.to(ok)).toHaveLength(1);
    const left = await db
      .select({ token: device.pushToken })
      .from(device)
      .where(eq(device.userId, t.id));
    expect(left).toEqual([{ token: ok }]);
  });

  it('panne transitoire : les autres appareils servis, puis erreur pour nouvel essai', async () => {
    const t = await account();
    const failing = await addDevice(t.id);
    const ok = await addDevice(t.id, 'android');
    push.failingTokens.add(failing);
    await expect(
      handle({ kind: 'daily_reminder', userId: t.id, date: '2025-06-10' }),
    ).rejects.toThrow('push indisponible');
    expect(push.to(ok)).toHaveLength(1);
  });

  it('compte sans appareil ou supprimé : rien, sans erreur', async () => {
    const t = await account();
    await handle({ kind: 'daily_reminder', userId: t.id, date: '2025-06-10' });
    await handle({ kind: 'daily_reminder', userId: newId(), date: '2025-06-10' });
    expect(push.sent).toEqual([]);
  });

  it('enregistré dans le registre du cron', () => {
    const types = jobHandlers({
      db,
      clock,
      push,
      mailer: { send: () => Promise.resolve() },
      publicWebUrl: 'https://example.test',
    }).map((h) => h.definition.type);
    expect(types).toContain('notify');
  });
});
