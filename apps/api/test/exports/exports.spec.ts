// Exports de dépenses (F-EXP-01, NF-SEC-01, ADR-036) : demande, tâche de fond, fichier chiffré sur
// disque, téléchargement par le demandeur seul pendant 15 minutes. Suite en février 2026.
import { readFile, readdir } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { category, exportFile, expense, notebook, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { EXPORT_LINK_TTL_MS, generateExportHandler } from '../../src/exports/export-job.js';
import { purgeExpiredExports } from '../../src/exports/export-purge.js';
import { decryptFile } from '../../src/exports/file-crypto.js';
import { createFileStore, EncryptedFileStore } from '../../src/exports/file-store.js';
import { MAX_ATTEMPTS } from '../../src/jobs/job-runner.js';
import { createTenant, type Tenant } from '../support/access.js';
import { http, startTestApp, TEST_ENV } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { auth } from '../support/expenses.js';
import { jobsOfType, testDb } from '../support/jobs.js';

interface ExportBody {
  id: string;
  format: string;
  from: string;
  to: string;
  status: string;
  expiresAt: string | null;
  detail?: string;
}
const body = (res: { body: unknown }) => res.body as ExportBody;

/** Parseur supertest : corps brut (CSV ou classeur), sans décodage. */
function binary(res: unknown, done: (err: Error | null, body: Buffer) => void) {
  const stream = res as Readable;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('exports de dépenses', () => {
  const clock = new FakeClock(Date.UTC(2026, 1, 10, 9, 0, 0));
  const { pool, db } = testDb(2);
  const files = createFileStore(loadConfig(TEST_ENV))!;
  const handler = generateExportHandler({ db, clock, files });
  const signal = new AbortController().signal;
  let app: INestApplication;

  beforeAll(async () => ({ app } = await startTestApp({ clock })));
  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const tenant = () => createTenant(app, db, clock.now());
  const base = (t: Tenant) => `/api/v1/notebooks/${t.notebookId}/exports`;
  const post = (t: Tenant, payload: object) =>
    request(http(app)).post(base(t)).set(auth(t)).send(payload);
  const status = (t: Tenant, id: string) =>
    request(http(app))
      .get(`${base(t)}/${id}`)
      .set(auth(t));
  const download = (t: Tenant, id: string) =>
    request(http(app))
      .get(`${base(t)}/${id}/file`)
      .set(auth(t))
      .buffer(true)
      .parse(binary);
  const generate = (exportId: string) =>
    handler.handle({ exportId }, { signal, jobId: newId(), attempt: 1 });

  /** Sous-catégorie du plan et sa racine. */
  async function subCategory(t: Tenant) {
    const [sub] = await db
      .select({ id: category.id, name: category.name, parentId: category.parentId })
      .from(category)
      .where(and(eq(category.notebookId, t.notebookId), isNotNull(category.parentId)))
      .limit(1);
    const [root] = await db
      .select({ id: category.id, name: category.name })
      .from(category)
      .where(eq(category.id, sub!.parentId!));
    return { sub: sub!, root: root! };
  }

  async function spend(
    t: Tenant,
    values: Partial<typeof expense.$inferInsert> & { categoryId: string },
  ) {
    const id = newId();
    const now = clock.now();
    await db.insert(expense).values({
      id,
      notebookId: t.notebookId,
      amount: 1000,
      currency: 'EUR',
      spentOn: '2026-02-05',
      createdAt: now,
      updatedAt: now,
      ...values,
    });
    return id;
  }

  const request_ = (format = 'csv', from = '2026-02-01', to = '2026-02-28') => ({
    id: newId(),
    format,
    from,
    to,
  });

  it('CSV : demande 202, tâche en file, puis fichier prêt 15 min, en français', async () => {
    const t = await tenant();
    const { sub, root } = await subCategory(t);
    await spend(t, { categoryId: sub.id, amount: 123456, spentOn: '2026-02-28', note: 'dîner' });
    await spend(t, { categoryId: root.id, amount: 5, spentOn: '2026-02-01', merchant: 'Café' });
    await spend(t, { categoryId: sub.id, spentOn: '2026-01-31' }); // hors période
    await spend(t, { categoryId: sub.id, spentOn: '2026-03-01' }); // hors période
    await spend(t, { categoryId: sub.id, deletedAt: clock.now() }); // supprimée
    const other = await tenant();
    await spend(other, { categoryId: (await subCategory(other)).sub.id }); // autre carnet

    const req = request_();
    const created = await post(t, req);
    expect(created.status).toBe(202);
    expect(body(created)).toEqual({ ...req, status: 'pending', expiresAt: null });
    const jobs = await jobsOfType(db, 'export.generate');
    expect(jobs.filter((j) => j.uniqueKey === `export:${req.id}`)).toHaveLength(1);
    expect((await download(t, req.id)).status).toBe(404); // pas encore prêt

    await generate(req.id);
    const ready = body(await status(t, req.id));
    expect(ready.status).toBe('ready');
    expect(Date.parse(ready.expiresAt!)).toBe(clock.now().getTime() + EXPORT_LINK_TTL_MS);

    const file = await download(t, req.id);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(file.headers['content-disposition']).toBe(
      'attachment; filename="depenseo_2026-02-01_2026-02-28.csv"',
    );
    expect(file.headers['cache-control']).toBe('no-store');
    expect((file.body as Buffer).toString('utf8')).toBe(
      '\uFEFFDate;Montant;Devise;Catégorie;Sous-catégorie;Marchand;Note;Étiquettes;Origine\r\n' +
        `2026-02-01;0,05;EUR;${root.name};;Café;;;Saisie\r\n` +
        `2026-02-28;1234,56;EUR;${root.name};${sub.name};;dîner;;Saisie\r\n`,
    );
  });

  it('fichier sur disque chiffré : illisible sans la clé, rien en clair', async () => {
    const t = await tenant();
    const { sub } = await subCategory(t);
    await spend(t, { categoryId: sub.id, amount: 987654, note: 'note-secrète' });
    const req = request_();
    await post(t, req);
    await generate(req.id);
    const sealed = await readFile(files.pathOf(req.id));
    expect(files.pathOf(req.id).startsWith(TEST_ENV.FILE_STORAGE_DIR)).toBe(true);
    for (const clear of ['9876,54', 'note-secrète', 'Montant', '2026-02-05']) {
      expect(sealed.includes(Buffer.from(clear, 'utf8')), clear).toBe(false);
    }
    expect(() => decryptFile(Buffer.alloc(32, 7), req.id, sealed)).toThrow();
    const key = Buffer.from(TEST_ENV.FILE_ENCRYPTION_KEY, 'base64');
    expect(decryptFile(key, req.id, sealed).toString('utf8')).toContain('9876,54;EUR');
    const names = await readdir(TEST_ENV.FILE_STORAGE_DIR);
    expect(names.filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('lien expiré (15 min) → 404, état « expired » ; la purge efface fichier et ligne', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    await generate(req.id);
    // Le jeton d'accès dure aussi 15 min : on vieillit l'export plutôt que l'horloge.
    await db
      .update(exportFile)
      .set({ expiresAt: new Date(clock.now().getTime()) })
      .where(eq(exportFile.id, req.id));
    expect((await download(t, req.id)).status).toBe(404);
    expect(body(await status(t, req.id)).status).toBe('expired');

    await purgeExpiredExports(files).run(db, new Date(clock.now().getTime() + 1));
    await expect(readFile(files.pathOf(req.id))).rejects.toThrow(/ENOENT/);
    expect(await db.select().from(exportFile).where(eq(exportFile.id, req.id))).toEqual([]);
    expect((await status(t, req.id)).status).toBe(404);
  });

  it('lien encore valide 1 ms avant l’échéance', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    await generate(req.id);
    clock.advance(EXPORT_LINK_TTL_MS - 1);
    try {
      expect((await download(t, req.id)).status).toBe(200);
      clock.advance(1);
      expect((await status(t, req.id)).status).toBe(401); // jeton de 15 min expiré lui aussi
    } finally {
      clock.set(Date.UTC(2026, 1, 10, 9, 0, 0));
    }
  });

  it('Excel : 403 hors Premium, classeur téléchargeable en Premium (anglais)', async () => {
    const t = await tenant();
    const { sub } = await subCategory(t);
    await spend(t, { categoryId: sub.id, amount: 4250, spentOn: '2026-02-03' });
    const refused = await post(t, request_('xlsx'));
    expect(refused.status).toBe(403);
    expect(await db.select().from(exportFile).where(eq(exportFile.userId, t.id))).toEqual([]);

    await db.update(user).set({ plan: 'premium', language: 'en' }).where(eq(user.id, t.id));
    const req = request_('xlsx');
    expect((await post(t, req)).status).toBe(202);
    await generate(req.id);
    const file = await download(t, req.id);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const parts = unzipSync(new Uint8Array(file.body as Buffer));
    const sheet = strFromU8(parts['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain('<t>Amount</t>');
    expect(sheet).toContain('<c r="A2" s="2"><v>46056</v></c>');
    expect(sheet).toContain('<c r="B2" s="4"><v>42.50</v></c>');
  });

  it('rejeu du même identifiant : même export ; identifiant réutilisé autrement → 409', async () => {
    const t = await tenant();
    const req = request_();
    expect((await post(t, req)).status).toBe(202);
    const replay = await post(t, req);
    expect(replay.status).toBe(202);
    expect(body(replay).id).toBe(req.id);
    expect(
      (await jobsOfType(db, 'export.generate')).filter((j) => j.uniqueKey === `export:${req.id}`),
    ).toHaveLength(1);
    expect((await post(t, { ...req, to: '2026-02-27' })).status).toBe(409);
    const other = await tenant();
    expect((await post(other, req)).status).toBe(409);
  });

  it('corps invalide → 400 (période inversée, format, dates, UUID non v7)', async () => {
    const t = await tenant();
    for (const bad of [
      request_('csv', '2026-02-28', '2026-02-01'),
      request_('pdf'),
      request_('csv', '2026-02-30'),
      { ...request_(), id: '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d' },
      { ...request_(), extra: 1 },
    ]) {
      expect((await post(t, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('un autre compte ne voit ni ne télécharge l’export (404), même avec l’identifiant', async () => {
    const alice = await tenant();
    const bob = await tenant();
    const req = request_();
    await post(alice, req);
    await generate(req.id);
    const asBob = (path: string) =>
      request(http(app))
        .get(`/api/v1/notebooks/${bob.notebookId}/exports/${req.id}${path}`)
        .set(auth(bob));
    expect((await asBob('')).status).toBe(404);
    expect((await asBob('/file')).status).toBe(404);
    const bobOnAlice = (path: string) =>
      request(http(app))
        .get(`${base(alice)}/${req.id}${path}`)
        .set(auth(bob));
    expect((await bobOnAlice('')).status).toBe(404);
    expect((await bobOnAlice('/file')).status).toBe(404);
    expect((await status(alice, 'pas-un-uuid')).status).toBe(404);
  });

  it('carnet supprimé avant la génération : export en échec, pas de fichier', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    await db.update(notebook).set({ deletedAt: clock.now() }).where(eq(notebook.id, t.notebookId));
    await generate(req.id);
    const [row] = await db.select().from(exportFile).where(eq(exportFile.id, req.id));
    expect(row!.status).toBe('failed');
    await expect(readFile(files.pathOf(req.id))).rejects.toThrow(/ENOENT/);
  });

  it('purge : demande restée en attente plus d’un jour supprimée, récente conservée', async () => {
    const t = await tenant();
    const old = request_();
    const recent = request_();
    const valid = request_();
    await post(t, old);
    await post(t, recent);
    await post(t, valid);
    await generate(valid.id);
    await db
      .update(exportFile)
      .set({ createdAt: new Date(clock.now().getTime() - 24 * 3_600_000 - 1) })
      .where(eq(exportFile.id, old.id));
    await purgeExpiredExports(files).run(db, clock.now());
    const ids = (
      await db.select({ id: exportFile.id }).from(exportFile).where(eq(exportFile.userId, t.id))
    ).map((r) => r.id);
    expect(ids.sort()).toEqual([recent.id, valid.id].sort());
    expect((await download(t, valid.id)).status).toBe(200); // fichier valide conservé
  });

  it('fichier illisible (clé changée par rotation) → 404, pas 500', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    await generate(req.id);
    const rotated = new EncryptedFileStore(TEST_ENV.FILE_STORAGE_DIR, Buffer.alloc(32, 9));
    await rotated.write(req.id, Buffer.from('ancien contenu'));
    expect((await download(t, req.id)).status).toBe(404);
  });

  it('échec au dernier essai : export « failed » ; avant, il reste en attente', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    const broken = generateExportHandler({ db, clock, files: undefined });
    const run = (attempt: number) =>
      broken.handle({ exportId: req.id }, { signal, jobId: newId(), attempt });
    await expect(run(MAX_ATTEMPTS - 1)).rejects.toThrow();
    expect(body(await status(t, req.id)).status).toBe('pending');
    await expect(run(MAX_ATTEMPTS)).rejects.toThrow();
    expect(body(await status(t, req.id)).status).toBe('failed');
  });

  it('ligne purgée pendant la génération : le fichier écrit est effacé', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    // Magasin qui supprime la ligne juste après l'écriture (purge ou cascade concurrente).
    const racing = Object.create(files) as EncryptedFileStore;
    racing.write = async (id, content) => {
      await files.write(id, content);
      await db.delete(exportFile).where(eq(exportFile.id, id));
    };
    await generateExportHandler({ db, clock, files: racing }).handle(
      { exportId: req.id },
      { signal, jobId: newId(), attempt: 1 },
    );
    await expect(readFile(files.pathOf(req.id))).rejects.toThrow(/ENOENT/);
  });

  it('exécution concurrente déjà terminée : son fichier est conservé', async () => {
    const t = await tenant();
    const req = request_();
    await post(t, req);
    // L'autre exécution rend l'export prêt entre notre écriture et notre clôture.
    const racing = Object.create(files) as EncryptedFileStore;
    racing.write = async (id, content) => {
      await files.write(id, content);
      await db
        .update(exportFile)
        .set({ status: 'ready', expiresAt: new Date(clock.now().getTime() + EXPORT_LINK_TTL_MS) })
        .where(eq(exportFile.id, id));
    };
    await generateExportHandler({ db, clock, files: racing }).handle(
      { exportId: req.id },
      { signal, jobId: newId(), attempt: 1 },
    );
    expect((await download(t, req.id)).status).toBe(200);
  });
});
