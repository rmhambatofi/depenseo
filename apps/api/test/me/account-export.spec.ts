// F-AUTH-08 (ADR-038) : `POST /me/export` → archive zip (JSON + CSV) chiffrée sur disque, générée
// par une tâche de fond, téléchargeable 15 min par le seul compte demandeur. La couverture est
// vérifiée par information_schema : chaque table qui référence le compte figure dans l'archive.
// Plages : juillet 2027 ; purge en mars 2023 (avant toute autre suite d'export, sans connexion).
import type { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import type mysql from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateAccountExportHandler } from '../../src/account-export/account-export-job.js';
import { AccountExportService } from '../../src/account-export/account-export.service.js';
import { ARCHIVE_JSON, csvEntry } from '../../src/account-export/archive.js';
import { EXCLUDED_TABLES, type PlainRow } from '../../src/account-export/personal-data.js';
import {
  accountExport,
  auditLog,
  device,
  notebookMember,
  user,
} from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { MAX_ATTEMPTS } from '../../src/jobs/job-runner.js';
import { purgeExpiredExports } from '../../src/exports/export-purge.js';
import type { EncryptedFileStore } from '../../src/exports/file-store.js';
import { FILE_STORE } from '../../src/exports/file-store.token.js';
import type { Tenant } from '../support/access.js';
import { http, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { migratorConnection } from '../support/db.js';
import { auth } from '../support/expenses.js';
import { testDb } from '../support/jobs.js';
import { populatedAccount } from '../support/populated-account.js';
import { ownedIds, referencingRows } from '../support/user-references.js';
import { createUser } from '../support/users.js';

/** Écrits en dur (et non lus dans l'implémentation) : le test doit mordre si la liste change. */
const SECRET_PROPERTIES = [
  'passwordHash',
  'adminTotpSecret',
  'tokenHash',
  'pushToken',
  'pushTokenHash',
  'subjectHash',
  'purchaseKeyHash',
  'actorUserId',
];

interface ExportBody {
  id: string;
  status: string;
  expiresAt: string | null;
}
interface Archive {
  format: string;
  version: number;
  generatedAt: string;
  tables: Record<string, PlainRow[]>;
}

/** Parseur supertest : corps brut, sans décodage. */
function binary(res: unknown, done: (err: Error | null, body: Buffer) => void) {
  const stream = res as Readable;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('export RGPD POST /me/export (F-AUTH-08)', () => {
  const now = new Date(Date.UTC(2027, 6, 12, 9, 0, 0));
  const clock = new FakeClock(now.getTime());
  const { pool, db } = testDb(2);
  const signal = new AbortController().signal;
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

  const populated = () => populatedAccount(app, db, store, now);
  const post = (t: Tenant, id: string) =>
    request(http(app)).post('/api/v1/me/export').set(auth(t)).send({ id });
  const status = (t: Tenant, id: string) =>
    request(http(app)).get(`/api/v1/me/export/${id}`).set(auth(t));
  const download = (t: Tenant, id: string) =>
    request(http(app)).get(`/api/v1/me/export/${id}/file`).set(auth(t)).buffer(true).parse(binary);
  const generate = (exportId: string) =>
    generateAccountExportHandler({ db, clock, files: store }).handle(
      { exportId },
      { signal, jobId: newId(), attempt: 1 },
    );

  /** Demande, génération, téléchargement : contenu de l'archive. */
  async function exportOf(t: Tenant) {
    const id = newId();
    const created = await post(t, id);
    expect(created.status).toBe(202);
    expect(created.body).toEqual({ id, status: 'pending', expiresAt: null });
    await generate(id);
    const ready = await status(t, id);
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({
      id,
      status: 'ready',
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    });
    const file = await download(t, id);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/zip');
    expect(file.headers['cache-control']).toBe('no-store');
    const entries = unzipSync(new Uint8Array(file.body as Buffer));
    const json = strFromU8(entries[ARCHIVE_JSON]!);
    return { id, entries, json, archive: JSON.parse(json) as Archive };
  }

  it('chaque table qui référence le compte figure dans l’archive (JSON et CSV), hors exclusions documentées', async () => {
    const t = await populated();
    const { entries, archive } = await exportOf(t);
    // Après génération : la demande elle-même figure dans l'archive (état figé depuis).
    const ids = await ownedIds(connection, [t.id, t.notebookId]);
    const footprint = await referencingRows(connection, ids, [t.email]);

    // Les exclusions concernent des tables réellement touchées (sinon la liste est périmée).
    for (const table of Object.keys(EXCLUDED_TABLES)) expect(footprint).toHaveProperty(table);
    const expected = Object.fromEntries(
      Object.entries(footprint).filter(([table]) => !(table in EXCLUDED_TABLES)),
    );
    // Même nombre de lignes, table par table : aucune ligne rattachée au compte n'est oubliée.
    const exported = Object.fromEntries(
      Object.entries(archive.tables).map(([table, rows]) => [table, rows.length]),
    );
    expect(exported).toEqual(expected);
    for (const table of Object.keys(expected)) {
      const csv = strFromU8(entries[csvEntry(table)]!);
      expect(csv.trim().split('\r\n').length, table).toBe(archive.tables[table]!.length + 1);
    }
    expect(entries['LISEZMOI.txt']).toBeDefined();
    expect(archive.format).toBe('depenseo-account-export');
    expect(archive.generatedAt).toBe(now.toISOString());

    // Compte, dépense supprimée logiquement (encore détenue) et montants en centimes.
    expect(archive.tables.user).toEqual([expect.objectContaining({ id: t.id, email: t.email })]);
    const expenses = archive.tables.expense!;
    expect(expenses.map((e) => e.amount).sort()).toEqual([1_250, 300]);
    expect(expenses.some((e) => e.deletedAt !== null)).toBe(true);
    expect(expenses.find((e) => e.amount === 300)!.spentOn).toBe('2027-05-08');
  });

  it('aucun secret ni donnée d’un autre compte dans l’archive', async () => {
    const t = await populated();
    const other = await populated();
    const totp = `totp-secret-${newId()}`;
    await db.update(user).set({ adminTotpSecret: totp }).where(eq(user.id, t.id));
    // Le compte, administrateur, a consulté autrui : action sur un tiers, hors de son export.
    await db.insert(auditLog).values({
      id: newId(),
      actorUserId: t.id,
      action: 'admin.view_user',
      targetType: 'user',
      targetId: other.id,
      createdAt: now,
    });
    // Autrui membre du carnet du compte : son adhésion n'est pas une donnée du compte.
    await db.insert(notebookMember).values({
      id: newId(),
      notebookId: t.notebookId,
      userId: other.id,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    });
    const { entries, archive } = await exportOf(t);
    const text = Object.values(entries)
      .map((bytes) => strFromU8(bytes))
      .join('\n');

    for (const rows of Object.values(archive.tables)) {
      for (const row of rows) {
        for (const key of SECRET_PROPERTIES) expect(row).not.toHaveProperty(key);
      }
    }
    const [account] = await db
      .select({ hash: user.passwordHash })
      .from(user)
      .where(eq(user.id, t.id));
    const [phone] = await db
      .select({ token: device.pushToken })
      .from(device)
      .where(eq(device.userId, t.id));
    expect(text).not.toContain(account!.hash!);
    expect(text).not.toContain(totp);
    expect(text).not.toContain(phone!.token);
    for (const marker of [other.id, other.email, other.notebookId]) {
      expect(text).not.toContain(marker);
    }
  });

  it('rejeu → même demande ; identifiant d’autrui → 409 ; autre compte → 404 ; non prêt → 404', async () => {
    const t = await populated();
    const other = await populated();
    const id = newId();
    expect((await post(t, id)).status).toBe(202);
    const replay = await post(t, id);
    expect(replay.status).toBe(202);
    expect((replay.body as ExportBody).id).toBe(id);
    expect(await db.select().from(accountExport).where(eq(accountExport.id, id))).toHaveLength(1);

    expect((await post(other, id)).status).toBe(409);
    expect((await status(other, id)).status).toBe(404);
    expect((await download(t, id)).status).toBe(404);
    await generate(id);
    expect((await download(other, id)).status).toBe(404);
    expect((await download(t, id)).status).toBe(200);
    expect((await status(t, 'pas-un-uuid')).status).toBe(404);
  });

  it('corps invalide → 400 ; sans jeton → 401', async () => {
    const t = await populated();
    const bad = await request(http(app))
      .post('/api/v1/me/export')
      .set(auth(t))
      .send({ id: newId(), extra: 1 });
    expect(bad.status).toBe(400);
    expect((await post(t, 'pas-un-uuid')).status).toBe(400);
    const anonymous = await request(http(app)).post('/api/v1/me/export').send({ id: newId() });
    expect(anonymous.status).toBe(401);
  });

  it('lien expiré (15 min) → état « expired », fichier 404', async () => {
    const t = await populated();
    const { id } = await exportOf(t);
    // Jeton d'accès de 15 min : on vieillit la ligne plutôt que l'horloge.
    await db
      .update(accountExport)
      .set({ expiresAt: new Date(now.getTime() - 1) })
      .where(eq(accountExport.id, id));
    expect((await status(t, id)).body).toMatchObject({ id, status: 'expired' });
    expect((await download(t, id)).status).toBe(404);
  });

  it('compte supprimé pendant la génération : aucun fichier orphelin', async () => {
    const t = await populated();
    const id = newId();
    expect((await post(t, id)).status).toBe(202);
    const racing = Object.create(store) as EncryptedFileStore;
    racing.write = async (fileId, content) => {
      await store.write(fileId, content);
      await db.delete(accountExport).where(eq(accountExport.id, fileId));
    };
    await generateAccountExportHandler({ db, clock, files: racing }).handle(
      { exportId: id },
      { signal, jobId: newId(), attempt: 1 },
    );
    expect(existsSync(store.pathOf(id))).toBe(false);
  });

  it('échec au dernier essai → état « failed » ; essai précédent : reste en attente', async () => {
    const t = await populated();
    const id = newId();
    expect((await post(t, id)).status).toBe(202);
    const broken = Object.create(store) as EncryptedFileStore;
    broken.write = () => Promise.reject(new Error('disque plein'));
    const handler = generateAccountExportHandler({ db, clock, files: broken });
    const run = (attempt: number) =>
      handler.handle({ exportId: id }, { signal, jobId: newId(), attempt });
    await expect(run(MAX_ATTEMPTS - 1)).rejects.toThrow('disque plein');
    expect((await status(t, id)).body).toMatchObject({ status: 'pending' });
    await expect(run(MAX_ATTEMPTS)).rejects.toThrow('disque plein');
    expect((await status(t, id)).body).toMatchObject({ status: 'failed', expiresAt: null });
    expect((await download(t, id)).status).toBe(404);
  });

  it('stockage non configuré → 503', async () => {
    const t = await populated();
    const service = new AccountExportService(db, clock, null);
    await expect(service.request(t.id, { id: newId() })).rejects.toMatchObject({ status: 503 });
  });

  it('purge : archive expirée effacée (fichier puis ligne)', async () => {
    const old = new Date(Date.UTC(2023, 2, 1, 9, 0, 0));
    const owner = await createUser(db, old);
    const id = newId();
    await db.insert(accountExport).values({
      id,
      userId: owner.id,
      status: 'ready',
      expiresAt: new Date(old.getTime() + 60_000),
      createdAt: old,
      updatedAt: old,
    });
    await store.write(id, Buffer.from('PK'));
    await purgeExpiredExports(store).run(db, new Date(old.getTime() + 120_000));
    expect(existsSync(store.pathOf(id))).toBe(false);
    expect(await db.select().from(accountExport).where(eq(accountExport.id, id))).toEqual([]);
  });
});
