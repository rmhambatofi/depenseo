// Échéances dues traitées par la tâche périodique (F-REC-02, ADR-033) : mode auto → dépense
// `recurrence` (une seule, même après plusieurs passages) ; mode confirmation → échéance « à
// confirmer » + tâche `notify` (clé `occurrence-due:<id>`). « Due » = échéance ≤ aujourd'hui dans le
// fuseau du compte (NF-FMT-05). La tâche parcourt toute la base : plage **janvier 2025** propre à
// cette suite (aucune autre échéance en attente avant mars 2025), comptes sans connexion.
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  category,
  expense,
  job,
  occurrence,
  recurringExpense,
  user,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { pendingOccurrences } from '../../src/recurring/occurrences.service.js';
import { processDueOccurrences } from '../../src/recurring/due-occurrences.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

describe('tâche process-due-occurrences', () => {
  const { pool, db } = testDb(2);
  const created = new Date(Date.UTC(2025, 0, 1));
  const recurrences: string[] = [];

  afterAll(async () => {
    // Ménage : les échéances encore en attente ne doivent pas être traitées par une autre suite.
    for (const id of recurrences) {
      await db
        .update(recurringExpense)
        .set({ deletedAt: created })
        .where(eq(recurringExpense.id, id));
    }
    await pool.promise().end();
  });

  /** Compte (fuseau donné), récurrence mensuelle écrite en base et ses échéances aux dates données. */
  async function setup(
    options: { timeZone?: string; mode?: 'auto' | 'confirm'; deleted?: boolean },
    dates: string[],
  ) {
    const t = await createUser(db, created);
    await db
      .update(user)
      .set({ timeZone: options.timeZone ?? 'Europe/Paris' })
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
      name: 'Loyer',
      amount: 65_000,
      currency: 'EUR',
      amountKind: 'fixed',
      frequency: 'monthly',
      startDate: dates[0]!,
      categoryId: cat!.id,
      mode: options.mode ?? 'auto',
      // Hors de portée de `generate-occurrences` : seules les échéances du test existent.
      generatedThrough: '9999-12-31',
      createdAt: created,
      updatedAt: created,
      deletedAt: options.deleted ? created : null,
    });
    const ids = [];
    for (const dueDate of dates) {
      const id = newId();
      await db.insert(occurrence).values({
        id,
        notebookId: t.notebookId,
        recurringExpenseId: recId,
        dueDate,
        status: 'pending',
        createdAt: created,
        updatedAt: created,
      });
      ids.push(id);
    }
    return { t, categoryId: cat!.id, ids };
  }

  const occ = async (id: string) =>
    (await db.select().from(occurrence).where(eq(occurrence.id, id)))[0]!;
  const expensesOf = (notebookId: string) =>
    db.select().from(expense).where(eq(expense.notebookId, notebookId));
  const notifyJobs = (occurrenceId: string) =>
    db
      .select()
      .from(job)
      .where(and(eq(job.type, 'notify'), eq(job.uniqueKey, `occurrence-due:${occurrenceId}`)));
  const run = (iso: string, batchSize?: number) =>
    processDueOccurrences(batchSize).run(db, new Date(iso));

  it('mode auto : une seule dépense `recurrence` par échéance due, même après deux passages', async () => {
    const { t, categoryId, ids } = await setup({ mode: 'auto' }, [
      '2025-01-05',
      '2025-01-06',
      '2025-01-20',
    ]);
    await db.update(occurrence).set({ amount: 66_123 }).where(eq(occurrence.id, ids[1]!));
    // 6 janvier 2025, 12:00 à Paris ; lots de 1 pour éprouver la pagination.
    await run('2025-01-06T11:00:00Z', 1);
    await run('2025-01-06T11:00:00Z', 1);

    const rows = await expensesOf(t.notebookId);
    expect(rows.map((r) => [r.spentOn, r.amount, r.source, r.categoryId, r.note]).sort()).toEqual([
      ['2025-01-05', 65_000, 'recurrence', categoryId, 'Loyer'],
      ['2025-01-06', 66_123, 'recurrence', categoryId, 'Loyer'],
    ]);
    const [first, second, later] = await Promise.all(ids.map(occ));
    expect(first).toMatchObject({ status: 'paid', amount: 65_000 });
    expect(second).toMatchObject({ status: 'paid', amount: 66_123 });
    expect(rows.map((r) => r.id).sort()).toEqual([first!.expenseId, second!.expenseId].sort());
    expect(later).toMatchObject({ status: 'pending', expenseId: null });
    expect(await notifyJobs(ids[0]!)).toEqual([]);
  });

  it('mode confirmation : échéance « à confirmer » et une seule notification, sans montant', async () => {
    const { t, ids } = await setup({ mode: 'confirm' }, ['2025-01-07', '2025-01-21']);
    await run('2025-01-07T09:00:00Z');
    await run('2025-01-07T09:05:00Z');

    expect(await expensesOf(t.notebookId)).toEqual([]);
    const jobs = await notifyJobs(ids[0]!);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]!.payload)).toEqual({
      kind: 'occurrence_due',
      notebookId: t.notebookId,
      occurrenceId: ids[0],
    });
    expect(await notifyJobs(ids[1]!)).toEqual([]);
    const upcoming = await pendingOccurrences(db, t.notebookId, '2025-01-31', 10);
    expect(upcoming.map((o) => [o.id, o.status, o.awaitingConfirmation])).toEqual([
      [ids[0], 'pending', true],
      [ids[1], 'pending', false],
    ]);
  });

  it('ignore les échéances payées, sautées ou de récurrences supprimées', async () => {
    const paid = await setup({ mode: 'confirm' }, ['2025-01-08', '2025-01-09']);
    await db.update(occurrence).set({ status: 'skipped' }).where(eq(occurrence.id, paid.ids[0]!));
    await db.update(occurrence).set({ status: 'paid' }).where(eq(occurrence.id, paid.ids[1]!));
    const deleted = await setup({ mode: 'auto', deleted: true }, ['2025-01-08']);
    await run('2025-01-10T12:00:00Z');
    expect(await expensesOf(deleted.t.notebookId)).toEqual([]);
    expect(await occ(deleted.ids[0]!)).toMatchObject({ status: 'pending' });
    for (const id of [...paid.ids, ...deleted.ids]) expect(await notifyJobs(id)).toEqual([]);
  });

  it('mode auto avec une catégorie devenue inutilisable : repli sur la confirmation', async () => {
    const { t, categoryId, ids } = await setup({ mode: 'auto' }, ['2025-01-11']);
    await db.update(category).set({ deletedAt: created }).where(eq(category.id, categoryId));
    await run('2025-01-11T12:00:00Z');
    expect(await expensesOf(t.notebookId)).toEqual([]);
    expect(await occ(ids[0]!)).toMatchObject({
      status: 'pending',
      expenseId: null,
      confirmationRequestedAt: new Date('2025-01-11T12:00:00Z'),
    });
    expect(await notifyJobs(ids[0]!)).toHaveLength(1);
  });

  it('une échéance en échec (fuseau invalide) ne bloque pas les autres et est signalée', async () => {
    const broken = await setup({ timeZone: 'Mars/Olympus_Mons', mode: 'auto' }, ['2025-01-12']);
    const sound = await setup({ mode: 'auto' }, ['2025-01-12']);
    await expect(run('2025-01-12T12:00:00Z')).rejects.toMatchObject({
      name: 'ScheduledTaskError',
      details: { failed: 1, occurrenceId: broken.ids[0] },
    });
    expect(await occ(sound.ids[0]!)).toMatchObject({ status: 'paid' });
    expect(await occ(broken.ids[0]!)).toMatchObject({ status: 'pending' });
    // Les tests suivants de la suite ne doivent plus la rencontrer (échec durable sinon).
    await db.update(occurrence).set({ status: 'skipped' }).where(eq(occurrence.id, broken.ids[0]!));
  });

  // Échéance du 15 janvier 2025 (heure d'hiver partout) : due à minuit dans le fuseau du compte.
  it.each([
    ['Indian/Reunion', '2025-01-14T19:59:00Z', '2025-01-14T20:00:00Z'], // UTC+4
    ['Europe/Paris', '2025-01-14T22:59:00Z', '2025-01-14T23:00:00Z'], // UTC+1
    ['Europe/Lisbon', '2025-01-14T23:59:00Z', '2025-01-15T00:00:00Z'], // UTC+0
    ['America/Montreal', '2025-01-15T04:59:00Z', '2025-01-15T05:00:00Z'], // UTC−5
  ])('%s : traitée à partir de minuit heure locale', async (timeZone, before, at) => {
    const { t, ids } = await setup({ timeZone, mode: 'auto' }, ['2025-01-15']);
    await run(before);
    expect(await occ(ids[0]!)).toMatchObject({ status: 'pending' });
    await run(at);
    expect(await occ(ids[0]!)).toMatchObject({ status: 'paid' });
    expect((await expensesOf(t.notebookId)).map((r) => r.spentOn)).toEqual(['2025-01-15']);
  });

  it('changement d’heure (Paris, 31 mars 2024) : due à minuit local, avant le passage à l’heure d’été', async () => {
    // Nuit du 30 au 31 mars : minuit = 23:00 UTC (UTC+1), le saut 02:00 → 03:00 vient après.
    // Mars 2024 : aucune autre suite n'a d'échéance aussi ancienne.
    const { ids } = await setup({ timeZone: 'Europe/Paris', mode: 'confirm' }, ['2024-03-31']);
    await run('2024-03-30T22:59:00Z');
    expect(await notifyJobs(ids[0]!)).toEqual([]);
    await run('2024-03-30T23:00:00Z');
    expect(await notifyJobs(ids[0]!)).toHaveLength(1);
  });
});
