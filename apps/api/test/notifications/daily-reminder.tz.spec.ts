// Rappel quotidien de saisie (F-NOT-02, ADR-034) : la tâche périodique `schedule-daily-reminders` met
// en file une tâche `notify` (clé `daily-reminder:<compte>:<jour local>`) dès que l'heure choisie est
// atteinte dans le fuseau du compte, avec une heure de rattrapage au plus. Heure locale inexistante
// (passage à l'heure d'été) → l'instant qui suit ; heure ambiguë → la première (NF-FMT-05).
// La tâche parcourt tous les comptes : instants de **février 2025** et changements d'heure de
// mars 2025 / octobre 2024, comptes sans connexion, assertions sur nos seuls comptes.
import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { job, user } from '../../src/db/schema/index.js';
import { scheduleDailyReminders } from '../../src/notifications/daily-reminders.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

describe('tâche schedule-daily-reminders', () => {
  const { pool, db } = testDb(2);
  const created = new Date(Date.UTC(2025, 0, 20));
  const accounts: string[] = [];

  afterAll(async () => {
    // Ménage : nos comptes ne doivent plus recevoir de rappel lors d'un autre passage.
    for (const id of accounts) {
      await db.update(user).set({ dailyReminderTime: null }).where(eq(user.id, id));
    }
    await pool.promise().end();
  });

  async function account(timeZone: string, dailyReminderTime: string | null) {
    const t = await createUser(db, created);
    accounts.push(t.id);
    await db.update(user).set({ timeZone, dailyReminderTime }).where(eq(user.id, t.id));
    return t.id;
  }

  const reminders = async (userId: string) =>
    (
      await db
        .select({ payload: job.payload, runAt: job.runAt, status: job.status })
        .from(job)
        .where(and(eq(job.type, 'notify'), like(job.uniqueKey, `daily-reminder:${userId}:%`)))
    ).map((row) => ({ ...row, payload: JSON.parse(row.payload) as unknown }));
  const run = (iso: string, batchSize?: number) =>
    scheduleDailyReminders(batchSize).run(db, new Date(iso));
  const minutes = (iso: string, delta: number) =>
    new Date(new Date(iso).getTime() + delta * 60_000).toISOString();

  it.each([
    // 20:30 le 10 février 2025 (heure d'hiver) dans chaque fuseau.
    ['Indian/Reunion', '2025-02-10T16:30:00.000Z'],
    ['Europe/Paris', '2025-02-10T19:30:00.000Z'],
    ['Europe/Lisbon', '2025-02-10T20:30:00.000Z'],
    // Jour local du 10 alors qu'il est déjà le 11 en UTC.
    ['America/Montreal', '2025-02-11T01:30:00.000Z'],
  ])('%s : rien avant 20:30 locales, un seul rappel ensuite', async (timeZone, at) => {
    const id = await account(timeZone, '20:30');
    await run(minutes(at, -1));
    expect(await reminders(id)).toEqual([]);
    await run(at);
    await run(minutes(at, 30));
    const found = await reminders(id);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      payload: { kind: 'daily_reminder', userId: id, date: '2025-02-10' },
      status: 'pending',
    });
    expect(found[0]!.runAt.getTime()).toBeLessThanOrEqual(new Date(minutes(at, 30)).getTime());
  });

  it('rappel désactivé (NULL) : rien', async () => {
    const id = await account('Europe/Paris', null);
    await run('2025-02-12T08:00:00.000Z');
    await run('2025-02-12T20:00:00.000Z');
    expect(await reminders(id)).toEqual([]);
  });

  it('cron interrompu plus d’une heure : le rappel du jour est abandonné, celui du lendemain part', async () => {
    const id = await account('Indian/Reunion', '07:00');
    // 07:00 à La Réunion = 03:00 UTC.
    await run('2025-02-14T04:00:00.000Z');
    expect(await reminders(id)).toEqual([]);
    await run('2025-02-15T03:59:00.000Z');
    expect((await reminders(id)).map((r) => (r.payload as { date: string }).date)).toEqual([
      '2025-02-15',
    ]);
  });

  it('rattrapage après minuit local : le rappel de 23:30 garde le jour de la veille', async () => {
    const id = await account('Europe/Paris', '23:30');
    // 23:30 le 19 février à Paris = 22:30 UTC ; passage cron à 00:10 locales le 20.
    await run('2025-02-19T23:10:00.000Z');
    expect((await reminders(id)).map((r) => (r.payload as { date: string }).date)).toEqual([
      '2025-02-19',
    ]);
  });

  it('heure modifiée après l’envoi : pas de second rappel le même jour', async () => {
    const id = await account('Europe/Lisbon', '08:00');
    await run('2025-02-20T08:00:00.000Z');
    await db.update(user).set({ dailyReminderTime: '08:30' }).where(eq(user.id, id));
    await run('2025-02-20T08:30:00.000Z');
    expect(await reminders(id)).toHaveLength(1);
  });

  it('pagine les comptes (lot de 1)', async () => {
    const a = await account('Europe/Lisbon', '12:00');
    const b = await account('Europe/Lisbon', '12:00');
    await run('2025-02-17T12:00:00.000Z', 1);
    expect(await reminders(a)).toHaveLength(1);
    expect(await reminders(b)).toHaveLength(1);
  });

  it('passage à l’heure d’été (Paris, 30 mars 2025) : 02:30 inexistante → 03:30 CEST', async () => {
    const id = await account('Europe/Paris', '02:30');
    // 03:30 CEST = 01:30 UTC (le 29 mars, 02:30 CET = 01:30 UTC aussi).
    await run('2025-03-30T01:29:00.000Z');
    expect((await reminders(id)).map((r) => (r.payload as { date: string }).date)).toEqual([]);
    await run('2025-03-30T01:30:00.000Z');
    // Le lendemain, 02:30 CEST = 00:30 UTC.
    await run('2025-03-31T00:30:00.000Z');
    expect((await reminders(id)).map((r) => (r.payload as { date: string }).date).sort()).toEqual([
      '2025-03-30',
      '2025-03-31',
    ]);
  });

  it('retour à l’heure d’hiver (Lisbonne, 27 octobre 2024) : 01:30 ambiguë → la première', async () => {
    const id = await account('Europe/Lisbon', '01:30');
    // Première 01:30 (WEST) = 00:30 UTC ; seconde (WET) = 01:30 UTC.
    await run('2024-10-27T00:29:00.000Z');
    expect(await reminders(id)).toEqual([]);
    await run('2024-10-27T00:30:00.000Z');
    await run('2024-10-27T01:30:00.000Z');
    expect(await reminders(id)).toHaveLength(1);
  });
});
