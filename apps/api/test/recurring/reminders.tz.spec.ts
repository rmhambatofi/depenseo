// Rappels d'échéance J-3 et jour J (F-REC-04, ADR-034) : la tâche périodique
// `schedule-occurrence-reminders` met en file une tâche `notify` (clé
// `occurrence-reminder:<échéance>:J-3|J`) dès que l'heure de rappel du propriétaire est atteinte dans
// son fuseau, si la récurrence l'active et que l'échéance est encore en attente (NF-FMT-05).
// La tâche parcourt toute la base : échéances de **février 2025** (et 10 mars 2024 pour le
// changement d'heure), mode confirmation (la tâche des échéances dues ne les paie pas), comptes
// sans connexion, récurrences supprimées en `afterAll`.
import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { category, job, occurrence, recurringExpense, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { scheduleOccurrenceReminders } from '../../src/recurring/occurrence-reminders.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

describe('tâche schedule-occurrence-reminders', () => {
  const { pool, db } = testDb(2);
  const created = new Date(Date.UTC(2025, 0, 20));
  const recurrences: string[] = [];

  afterAll(async () => {
    for (const id of recurrences) {
      await db
        .update(recurringExpense)
        .set({ deletedAt: created })
        .where(eq(recurringExpense.id, id));
    }
    await pool.promise().end();
  });

  async function setup(
    options: {
      timeZone: string;
      reminderTime?: string;
      remindThreeDaysBefore?: boolean;
      remindOnDueDate?: boolean;
      deleted?: boolean;
      status?: 'pending' | 'paid' | 'skipped';
    },
    dueDate: string,
  ) {
    const t = await createUser(db, created);
    await db
      .update(user)
      .set({ timeZone: options.timeZone, reminderTime: options.reminderTime ?? '09:00' })
      .where(eq(user.id, t.id));
    const [cat] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.notebookId, t.notebookId))
      .limit(1);
    const recId = newId();
    recurrences.push(recId);
    await db.insert(recurringExpense).values({
      id: recId,
      notebookId: t.notebookId,
      name: 'Assurance',
      amount: 4_200,
      currency: 'EUR',
      amountKind: 'fixed',
      frequency: 'monthly',
      startDate: dueDate,
      categoryId: cat!.id,
      mode: 'confirm',
      remindThreeDaysBefore: options.remindThreeDaysBefore ?? true,
      remindOnDueDate: options.remindOnDueDate ?? true,
      generatedThrough: '9999-12-31',
      createdAt: created,
      updatedAt: created,
      deletedAt: options.deleted ? created : null,
    });
    const id = newId();
    await db.insert(occurrence).values({
      id,
      notebookId: t.notebookId,
      recurringExpenseId: recId,
      dueDate,
      status: options.status ?? 'pending',
      createdAt: created,
      updatedAt: created,
    });
    return { notebookId: t.notebookId, id };
  }

  const reminders = async (occurrenceId: string) =>
    (
      await db
        .select({ key: job.uniqueKey, payload: job.payload })
        .from(job)
        .where(
          and(eq(job.type, 'notify'), like(job.uniqueKey, `occurrence-reminder:${occurrenceId}:%`)),
        )
    )
      .map((row) => ({ key: row.key, payload: JSON.parse(row.payload) as unknown }))
      .sort((a, b) => a.key!.localeCompare(b.key!));
  const kinds = async (occurrenceId: string) =>
    (await reminders(occurrenceId)).map((r) => r.key!.split(':')[2]);
  const run = (iso: string, batchSize?: number) =>
    scheduleOccurrenceReminders(batchSize).run(db, new Date(iso));
  const minutes = (iso: string, delta: number) =>
    new Date(new Date(iso).getTime() + delta * 60_000).toISOString();

  it.each([
    // 09:00 locales en heure d'hiver ; échéances espacées de 6 jours (aucun rappel croisé).
    ['Indian/Reunion', '2025-02-06', '2025-02-03T05:00:00.000Z', '2025-02-06T05:00:00.000Z'],
    ['Europe/Paris', '2025-02-12', '2025-02-09T08:00:00.000Z', '2025-02-12T08:00:00.000Z'],
    ['Europe/Lisbon', '2025-02-18', '2025-02-15T09:00:00.000Z', '2025-02-18T09:00:00.000Z'],
    ['America/Montreal', '2025-02-24', '2025-02-21T14:00:00.000Z', '2025-02-24T14:00:00.000Z'],
  ])('%s : J-3 puis jour J à 09:00 locales, une fois chacun', async (timeZone, due, j3, j) => {
    const o = await setup({ timeZone }, due);
    await run(minutes(j3, -1));
    expect(await reminders(o.id)).toEqual([]);
    await run(j3);
    await run(minutes(j3, 30));
    expect(await reminders(o.id)).toEqual([
      {
        key: `occurrence-reminder:${o.id}:J-3`,
        payload: {
          kind: 'occurrence_reminder',
          notebookId: o.notebookId,
          occurrenceId: o.id,
          reminder: 'three_days_before',
        },
      },
    ]);
    await run(minutes(j, -1));
    expect(await kinds(o.id)).toEqual(['J-3']);
    await run(j);
    await run(minutes(j, 59));
    expect(await reminders(o.id)).toHaveLength(2);
    expect((await reminders(o.id))[0]).toMatchObject({
      key: `occurrence-reminder:${o.id}:J`,
      payload: { kind: 'occurrence_reminder', reminder: 'due_date' },
    });
  });

  it('réglages par récurrence : J-3 seul, jour J seul', async () => {
    const onlyDay = await setup(
      { timeZone: 'Europe/Paris', remindThreeDaysBefore: false },
      '2025-02-27',
    );
    const onlyBefore = await setup(
      { timeZone: 'Europe/Paris', remindOnDueDate: false },
      '2025-02-28',
    );
    for (const day of ['2025-02-24', '2025-02-25', '2025-02-27', '2025-02-28']) {
      await run(`${day}T08:00:00.000Z`);
    }
    expect(await kinds(onlyDay.id)).toEqual(['J']);
    expect(await kinds(onlyBefore.id)).toEqual(['J-3']);
  });

  it('heure de rappel du compte ; échéance payée, sautée ou récurrence supprimée : rien', async () => {
    const early = await setup({ timeZone: 'Europe/Lisbon', reminderTime: '06:15' }, '2025-02-08');
    const paid = await setup({ timeZone: 'Europe/Lisbon', status: 'paid' }, '2025-02-08');
    const skipped = await setup({ timeZone: 'Europe/Lisbon', status: 'skipped' }, '2025-02-08');
    const deleted = await setup({ timeZone: 'Europe/Lisbon', deleted: true }, '2025-02-08');
    await run('2025-02-08T06:14:00.000Z');
    expect(await kinds(early.id)).toEqual([]);
    await run('2025-02-08T06:15:00.000Z');
    await run('2025-02-08T09:00:00.000Z');
    expect(await kinds(early.id)).toEqual(['J']);
    for (const o of [paid, skipped, deleted]) expect(await kinds(o.id)).toEqual([]);
  });

  it('cron interrompu plus d’une heure : le rappel est abandonné', async () => {
    const o = await setup({ timeZone: 'Indian/Reunion' }, '2025-02-21');
    await run('2025-02-18T06:01:00.000Z');
    await run('2025-02-21T06:01:00.000Z');
    expect(await kinds(o.id)).toEqual([]);
  });

  it('fuseau en avance sur UTC : J-3 à 02:00 à La Réunion, encore la veille en UTC', async () => {
    const o = await setup({ timeZone: 'Indian/Reunion', reminderTime: '02:00' }, '2025-02-10');
    // J-3 = 7 février 02:00 (UTC+4) = 6 février 22:00 UTC, quatre jours UTC avant l'échéance.
    await run('2025-02-06T22:00:00.000Z');
    expect(await kinds(o.id)).toEqual(['J-3']);
  });

  it('fuseau en retard sur UTC : jour J à 23:30 à Montréal, déjà le lendemain en UTC', async () => {
    const o = await setup({ timeZone: 'America/Montreal', reminderTime: '23:30' }, '2025-02-26');
    // Jour J = 26 février 23:30 (UTC−5) = 27 février 04:30 UTC.
    await run('2025-02-27T04:40:00.000Z');
    expect(await kinds(o.id)).toEqual(['J']);
  });

  it('pagine les échéances (lot de 1)', async () => {
    const a = await setup({ timeZone: 'Europe/Paris' }, '2025-02-15');
    const b = await setup({ timeZone: 'Europe/Paris' }, '2025-02-15');
    await run('2025-02-15T08:00:00.000Z', 1);
    expect(await kinds(a.id)).toEqual(['J']);
    expect(await kinds(b.id)).toEqual(['J']);
  });

  it('passage à l’heure d’été (Montréal, 10 mars 2024) : 02:30 inexistante → 03:30 EDT', async () => {
    const o = await setup({ timeZone: 'America/Montreal', reminderTime: '02:30' }, '2024-03-10');
    // J-3 (7 mars, EST) : 02:30 = 07:30 UTC. Jour J : 03:30 EDT = 07:30 UTC.
    await run('2024-03-07T07:30:00.000Z');
    expect(await kinds(o.id)).toEqual(['J-3']);
    await run('2024-03-10T07:29:00.000Z');
    expect(await kinds(o.id)).toEqual(['J-3']);
    await run('2024-03-10T07:30:00.000Z');
    expect(await kinds(o.id)).toEqual(['J', 'J-3']);
  });
});
