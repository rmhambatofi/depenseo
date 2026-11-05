// F-AUTH-07 (ADR-037) : `DELETE /me` efface immédiatement et définitivement toutes les données du
// compte. La vérification parcourt **toutes** les tables d'information_schema : une table ajoutée
// plus tard doit être couverte par la fixture (premier test) puis par la purge (second test).
// Plage : mai 2027 (aucune autre suite ; aucune tâche périodique lancée ici).
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type mysql from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditLog,
  category,
  emailToken,
  job,
  limitAlert,
  notebookMember,
  notificationSetting,
  spendingLimit,
  userIdentity,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { EncryptedFileStore } from '../../src/exports/file-store.js';
import { FILE_STORE } from '../../src/exports/file-store.token.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { migratorConnection } from '../support/db.js';
import { auth, expenseClient } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { insertDevice } from '../support/push.js';
import { recurringClient } from '../support/recurring.js';
import { allTables, ownedIds, referencingRows } from '../support/user-references.js';

describe('suppression du compte DELETE /me (F-AUTH-07)', () => {
  const now = new Date(Date.UTC(2027, 4, 10, 8, 0, 0));
  const clock = new FakeClock(now.getTime());
  const { pool, db } = testDb(2);
  let app: INestApplication;
  let connection: mysql.Connection;
  let store: EncryptedFileStore;
  const expenses = expenseClient(() => app, db, clock);
  const recurring = recurringClient(() => app);

  beforeAll(async () => {
    ({ app } = await startTestApp({ clock }));
    store = app.get<EncryptedFileStore>(FILE_STORE);
    connection = await migratorConnection();
  });

  afterAll(async () => {
    await app.close();
    await connection.end();
    await pool.promise().end();
  });

  const subcategory = async (t: Tenant) => {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.notebookId, t.notebookId), sql`${category.parentId} is not null`))
      .limit(1);
    return row!.id;
  };

  /** Compte complet : une ligne dans chaque table, suppressions logiques et fichier compris. */
  async function populated(): Promise<Tenant & { exportId: string }> {
    const t = await createTenant(app, db, now);
    const categoryId = await subcategory(t);

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
    return { ...t, exportId };
  }

  const footprint = async (t: Tenant) => {
    const ids = await ownedIds(connection, [t.id, t.notebookId]);
    return { ids, rows: await referencingRows(connection, ids, [t.email]) };
  };

  const deleteMe = (t: Tenant) => request(http(app)).delete('/api/v1/me').set(auth(t));

  it('la fixture touche toutes les tables du schéma (toute nouvelle table doit y être ajoutée)', async () => {
    const t = await populated();
    const { rows } = await footprint(t);
    expect(Object.keys(rows).sort()).toEqual(await allTables(connection));
  });

  it('204 puis plus aucune ligne ne référence le compte ; fichiers effacés ; autrui intact', async () => {
    const victim = await populated();
    const bystander = await populated();
    const before = await footprint(victim);
    const others = await footprint(bystander);
    // La victime est aussi membre du carnet d'autrui : seule son adhésion doit disparaître.
    await db.insert(notebookMember).values({
      id: newId(),
      notebookId: bystander.notebookId,
      userId: victim.id,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    });

    const res = await deleteMe(victim);
    expect(res.status).toBe(204);

    // Le journal d'audit survit, pseudonymisé : seule sa clé primaire reste dans l'ensemble.
    expect(await referencingRows(connection, before.ids, [victim.email], ['audit_log'])).toEqual(
      {},
    );
    const [audit] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT target_id, action FROM audit_log WHERE id IN (?) ORDER BY action`,
      [[...before.ids].map((id) => Buffer.from(id.replaceAll('-', ''), 'hex'))],
    );
    expect(audit).toEqual([
      { target_id: null, action: 'admin.view_notebook' },
      { target_id: null, action: 'admin.view_user' },
    ]);
    expect(existsSync(store.pathOf(victim.exportId))).toBe(false);

    expect((await footprint(bystander)).rows).toEqual(others.rows);
    expect(existsSync(store.pathOf(bystander.exportId))).toBe(true);
  });

  it('après suppression : jeton encore signé → 401, connexion impossible, DELETE rejoué → 401', async () => {
    const t = await populated();
    expect((await deleteMe(t)).status).toBe(204);
    expect((await request(http(app)).get('/api/v1/me').set(auth(t))).status).toBe(401);
    expect((await deleteMe(t)).status).toBe(401);
    const login = await request(http(app))
      .post('/api/v1/auth/login')
      .send({ email: t.email, password: t.password });
    expect(login.status).toBe(401);
    const notebook = await request(http(app)).get(`/api/v1/notebooks/${t.notebookId}`).set(auth(t));
    expect(notebook.status).toBe(404);
  });

  it('sans jeton → 401', async () => {
    expect((await request(http(app)).delete('/api/v1/me')).status).toBe(401);
  });
});
