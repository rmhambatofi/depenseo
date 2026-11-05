// Outils communs aux suites du gestionnaire `notify` (F-NOT-01, F-NOT-04, F-NOT-05, ADR-035).
// Plage d'horloge : juin 2025 ; comptes sans connexion (cf. `tokens.spec`).
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../../src/db/connection.js';
import {
  category,
  expense,
  occurrence,
  recurringExpense,
  user,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { notifyHandler } from '../../src/notifications/notify.handler.js';
import type { NOTIFY } from '../../src/notifications/notify-job.js';
import type { FakeClock } from './clock.js';
import { type FakePushSender, insertDevice } from './push.js';
import { createUser } from './users.js';

export type Payload = z.infer<typeof NOTIFY.payload>;

// Mardi 10 juin 2025, 12:00 à Paris.
export const NOON = Date.UTC(2025, 5, 10, 10, 0, 0);
export const STAMP = new Date(Date.UTC(2025, 5, 1));

/** `push` est relu à chaque appel : la suite le recrée avant chaque test. */
export function notifyFixtures(deps: {
  db: Database;
  clock: FakeClock;
  push: () => FakePushSender;
}) {
  const { db, clock } = deps;

  const handle = (payload: Payload, jobId = newId()) =>
    notifyHandler({ db, clock, push: deps.push() }).handle(payload, {
      jobId,
      attempt: 1,
      signal: new AbortController().signal,
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

  return { handle, account, addDevice, leafCategory, addExpense, addOccurrence };
}
