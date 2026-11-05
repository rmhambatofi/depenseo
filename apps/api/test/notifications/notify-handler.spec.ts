// Gestionnaire `notify` (F-NOT-01, F-NOT-04, F-NOT-05, ADR-035) : destinataire, réglages par type,
// fusion du rappel « jour J » avec l'échéance à confirmer, appareils désinscrits, contenu sans montant.
// Plage de silence et notifications devenues sans objet : `notify-handler-skip.spec`.
// Plage d'horloge : juin 2025 ; comptes sans connexion (cf. `tokens.spec`).
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { device, spendingLimit } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { jobHandlers } from '../../src/jobs/registry.js';
import { updateNotificationSettings } from '../../src/notifications/notification-settings.js';
import { FakeClock } from '../support/clock.js';
import { testDb } from '../support/jobs.js';
import { NOON, notifyFixtures, STAMP } from '../support/notify-fixtures.js';
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
