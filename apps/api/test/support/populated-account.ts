// Compte « complet » pour les tests RGPD (F-AUTH-07, F-AUTH-08) : une ligne dans chaque table du
// schéma, suppressions logiques et fichiers chiffrés compris. Toute nouvelle table doit y être
// ajoutée (vérifié par `test/me/account-deletion.spec.ts`).
import { createHash, randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { expect } from 'vitest';
import type { Database } from '../../src/db/connection.js';
import {
  auditLog,
  category,
  emailToken,
  job,
  limitAlert,
  notificationSetting,
  spendingLimit,
  user,
  userIdentity,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { EncryptedFileStore } from '../../src/exports/file-store.js';
import { createTenant, type Tenant } from './access.js';
import { http } from './app.js';
import { FakeClock } from './clock.js';
import { auth, expenseClient } from './expenses.js';
import { insertDevice } from './push.js';
import { insertSubscription } from './subscriptions.js';
import { recurringClient } from './recurring.js';

const subcategory = async (db: Database, t: Tenant) => {
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.notebookId, t.notebookId), sql`${category.parentId} is not null`))
    .limit(1);
  return row!.id;
};

/** Compte complet : une ligne dans chaque table, suppressions logiques et fichier compris. */
export async function populatedAccount(
  app: INestApplication,
  db: Database,
  store: EncryptedFileStore,
  now: Date,
): Promise<Tenant & { exportId: string; accountExportId: string }> {
  const expenses = expenseClient(() => app, db, new FakeClock(now.getTime()));
  const recurring = recurringClient(() => app);
  const t = await createTenant(app, db, now);
  const categoryId = await subcategory(db, t);

  const kept = await expenses.create(t, {
    id: newId(),
    amount: 1_250,
    categoryId,
    date: '2027-05-09',
    tags: ['vacances'],
  });
  expect(kept.status).toBe(201);
  const dropped = await expenses.create(t, {
    id: newId(),
    amount: 300,
    categoryId,
    date: '2027-05-08',
  });
  expect((await expenses.remove(t, (dropped.body as { id: string }).id)).status).toBe(204);

  const rec = await recurring.create(
    t,
    recurring.body(categoryId, { startDate: '2027-05-20', frequency: 'monthly' }),
  );
  expect(rec.status).toBe(201);

  const exportId = newId();
  const exported = await request(http(app))
    .post(`/api/v1/notebooks/${t.notebookId}/exports`)
    .set(auth(t))
    .send({ id: exportId, format: 'csv', from: '2027-05-01', to: '2027-05-31' });
  expect(exported.status).toBe(202);
  await store.write(exportId, Buffer.from('date;montant\n'));

  const accountExportId = newId();
  const accountExported = await request(http(app))
    .post('/api/v1/me/export')
    .set(auth(t))
    .send({ id: accountExportId });
  expect(accountExported.status).toBe(202);
  await store.write(accountExportId, Buffer.from('PK'));

  const stamps = { createdAt: now, updatedAt: now };
  await db.insert(spendingLimit).values({
    id: newId(),
    notebookId: t.notebookId,
    categoryId,
    periodKind: 'month',
    startDay: 1,
    amount: 10_000,
    currency: 'EUR',
    includeRecurring: true,
    effectiveDate: '2027-05-10',
    ...stamps,
  });
  await db.insert(limitAlert).values({
    id: newId(),
    notebookId: t.notebookId,
    periodStart: '2027-05-01',
    threshold: 80,
    ...stamps,
  });
  await insertDevice(db, t.id, 'ios', now);
  await insertSubscription(db, t.id, now, { expiresAt: new Date(now.getTime() + 30 * 86_400_000) });
  await db.update(user).set({ trialEndsAt: now }).where(eq(user.id, t.id));
  await db
    .insert(notificationSetting)
    .values({ id: newId(), userId: t.id, quietStart: '22:00', quietEnd: '07:00', ...stamps });
  await db.insert(userIdentity).values({
    id: newId(),
    userId: t.id,
    provider: 'apple',
    subjectHash: createHash('sha256').update(newId()).digest(),
    createdAt: now,
  });
  await db.insert(emailToken).values({
    id: newId(),
    userId: t.id,
    purpose: 'reset_password',
    tokenHash: randomBytes(32),
    expiresAt: new Date(now.getTime() + 3_600_000),
    createdAt: now,
  });
  await db.insert(auditLog).values({
    id: newId(),
    actorUserId: t.id,
    action: 'admin.view_user',
    targetType: 'user',
    targetId: t.id,
    createdAt: now,
  });
  await db.insert(auditLog).values({
    id: newId(),
    actorUserId: newId(),
    action: 'admin.view_notebook',
    targetType: 'notebook',
    targetId: t.notebookId,
    createdAt: now,
  });
  await db.insert(job).values({
    id: newId(),
    type: 'notify',
    payload: JSON.stringify({ kind: 'daily_reminder', userId: t.id, date: '2027-05-10' }),
    runAt: now,
    uniqueKey: `daily-reminder:${t.id}:2027-05-10`,
    ...stamps,
  });
  return { ...t, exportId, accountExportId };
}
