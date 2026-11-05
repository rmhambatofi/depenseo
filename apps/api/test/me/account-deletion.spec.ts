// F-AUTH-07 (ADR-037) : `DELETE /me` efface immédiatement et définitivement toutes les données du
// compte. La vérification parcourt **toutes** les tables d'information_schema : une table ajoutée
// plus tard doit être couverte par la fixture (premier test) puis par la purge (second test).
// Plage : mai 2027 (aucune autre suite ; aucune tâche périodique lancée ici).
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type mysql from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notebookMember } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type { EncryptedFileStore } from '../../src/exports/file-store.js';
import { FILE_STORE } from '../../src/exports/file-store.token.js';
import type { Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { migratorConnection } from '../support/db.js';
import { auth } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { populatedAccount } from '../support/populated-account.js';
import { allTables, ownedIds, referencingRows } from '../support/user-references.js';

describe('suppression du compte DELETE /me (F-AUTH-07)', () => {
  const now = new Date(Date.UTC(2027, 4, 10, 8, 0, 0));
  const clock = new FakeClock(now.getTime());
  const { pool, db } = testDb(2);
  let app: INestApplication;
  let connection: mysql.Connection;
  let store: EncryptedFileStore;

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

  /** Compte complet : une ligne dans chaque table, suppressions logiques et fichiers compris. */
  const populated = () => populatedAccount(app, db, store, now);

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
    expect(existsSync(store.pathOf(victim.accountExportId))).toBe(false);

    expect((await footprint(bystander)).rows).toEqual(others.rows);
    expect(existsSync(store.pathOf(bystander.exportId))).toBe(true);
    expect(existsSync(store.pathOf(bystander.accountExportId))).toBe(true);
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
