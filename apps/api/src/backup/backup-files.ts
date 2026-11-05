// Fichiers d'export horaire (NF-DISP-01, NF-SEC-01, §8.2, ADR-039) : SQL compressé (gzip) puis
// chiffré par l'application (AES-256-GCM, format « DPF1 » d'ADR-036) avec une clé dédiée
// `BACKUP_ENCRYPTION_KEY`, distincte de celle des fichiers servis par l'API. Rotation par âge.
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { createGzip, gunzip } from 'node:zlib';
import type { Connection } from 'mysql2';
import { z } from 'zod';
import { aes256Key, ConfigError, databaseUrl, parseEnv } from '../config/env.js';
import { describeError } from '../logging/redact.js';
import { decryptFile, encryptFile, FileDecryptionError } from '../exports/file-crypto.js';
import {
  openDumpConnection,
  withConsistentSnapshot,
  writeDump,
  type DumpStats,
  type TableFilter,
} from './db-dump.js';
import { DumpFormatError, restoreDump, TargetNotEmptyError } from './db-restore.js';

/** Données associées du chiffrement : un fichier d'une autre nature ne se déchiffre pas ici. */
export const BACKUP_AAD = 'depenseo-db-export-v1';
const NAME_PATTERN = /^depenseo-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.sql\.gz\.enc$/;
const HOUR_MS = 3_600_000;

const exportSchema = z.object({
  /** Compte API suffit (lecture seule ; aucune donnée modifiée). */
  DATABASE_URL: databaseUrl,
  /** Dossier absolu hors du dossier public (et hors de FILE_STORAGE_DIR). */
  BACKUP_DIR: z.string().refine((value) => isAbsolute(value)),
  BACKUP_ENCRYPTION_KEY: aes256Key,
  /** Durée de conservation des exports horaires sur le serveur. */
  BACKUP_RETENTION_HOURS: z.coerce
    .number()
    .int()
    .min(2)
    .max(24 * 30)
    .default(48),
});
export type BackupExportConfig = Readonly<z.infer<typeof exportSchema>>;

const restoreSchema = z.object({
  /** Compte migrator (DDL) sur une base **vide**. */
  RESTORE_DATABASE_URL: databaseUrl,
  BACKUP_ENCRYPTION_KEY: aes256Key,
});
export type BackupRestoreConfig = Readonly<z.infer<typeof restoreSchema>>;

export const loadBackupExportConfig = (env: Readonly<Record<string, string | undefined>>) =>
  parseEnv(exportSchema, env);
export const loadBackupRestoreConfig = (env: Readonly<Record<string, string | undefined>>) =>
  parseEnv(restoreSchema, env);

export function backupKey(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/** `depenseo-20261105T140000Z.sql.gz.enc` : horodatage UTC de l'instantané, tri lexicographique. */
export function backupFileName(epochMs: number): string {
  const stamp = new Date(epochMs)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return `depenseo-${stamp}.sql.gz.enc`;
}

export function backupTakenAt(name: string): number | undefined {
  const m = NAME_PATTERN.exec(name);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

export interface ExportResult extends DumpStats {
  file: string;
  bytes: number;
  pruned: string[];
}

/** Export complet → fichier chiffré écrit atomiquement (renommage), puis rotation. */
export async function exportDatabase(options: {
  databaseUrl: string;
  dir: string;
  key: Buffer;
  retentionHours: number;
  now: number;
  include?: TableFilter;
  /** Appelé dans l'instantané, après l'écriture (tests : relire exactement les données exportées). */
  afterDump?: (connection: Connection) => Promise<void>;
}): Promise<ExportResult> {
  const connection = await openDumpConnection(options.databaseUrl);
  let compressed: Buffer;
  let stats: DumpStats;
  try {
    ({ compressed, stats } = await withConsistentSnapshot(connection, async (c) => {
      const dumped = await gzipDump((sink) =>
        writeDump(c, sink, {
          include: options.include,
          generatedAt: new Date(options.now).toISOString(),
        }),
      );
      await options.afterDump?.(c);
      return dumped;
    }));
  } finally {
    await connection.promise().end();
  }
  const sealed = encryptFile(options.key, BACKUP_AAD, compressed);
  await mkdir(options.dir, { recursive: true, mode: 0o700 });
  const file = join(options.dir, backupFileName(options.now));
  const temporary = join(options.dir, `.tmp-${randomBytes(8).toString('hex')}`);
  try {
    await writeFile(temporary, sealed, { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  const pruned = await pruneBackups(options.dir, options.now, options.retentionHours);
  return { file, bytes: sealed.length, pruned, ...stats };
}

async function gzipDump(
  produce: (sink: { write(text: string): Promise<void> }) => Promise<DumpStats>,
): Promise<{ compressed: Buffer; stats: DumpStats }> {
  const gzip = createGzip();
  const chunks: Buffer[] = [];
  gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    gzip.on('end', resolve);
    gzip.on('error', reject);
  });
  // Une erreur de gzip pendant `produce` rejette aussi `write` : éviter un rejet non géré ici.
  ended.catch(() => undefined);
  const sink = {
    write: (text: string) =>
      new Promise<void>((resolve, reject) =>
        gzip.write(text, 'utf8', (error) => (error ? reject(error) : resolve())),
      ),
  };
  let stats: DumpStats;
  try {
    stats = await produce(sink);
  } catch (error) {
    gzip.destroy();
    throw error;
  }
  gzip.end();
  await ended;
  return { compressed: Buffer.concat(chunks), stats };
}

/** Supprime les exports plus anciens que la rétention (d'après leur nom, pas leur date système). */
export async function pruneBackups(
  dir: string,
  now: number,
  retentionHours: number,
): Promise<string[]> {
  const pruned: string[] = [];
  for (const name of await readdir(dir)) {
    const takenAt = backupTakenAt(name);
    if (takenAt === undefined || now - takenAt <= retentionHours * HOUR_MS) continue;
    await rm(join(dir, name));
    pruned.push(name);
  }
  return pruned.sort();
}

/** Déchiffre et décompresse un export (lève `FileDecryptionError` si clé ou contenu invalides). */
export async function readBackup(file: string, key: Buffer): Promise<string> {
  const plain = decryptFile(key, BACKUP_AAD, await readFile(file));
  return (await promisify(gunzip)(plain)).toString('utf8');
}

export async function restoreBackup(options: {
  file: string;
  key: Buffer;
  databaseUrl: string;
}): Promise<number> {
  const dump = await readBackup(options.file, options.key);
  const connection = await openDumpConnection(options.databaseUrl);
  try {
    return await restoreDump(connection, dump);
  } finally {
    await connection.promise().end();
  }
}

/**
 * Erreur journalisable par les scripts : messages des erreurs propres au module seulement (ils ne
 * contiennent ni valeur de variable ni donnée) ; sinon `describeError` (code, errno, pile).
 */
export function describeBackupError(error: unknown): Record<string, unknown> {
  const known = [ConfigError, DumpFormatError, TargetNotEmptyError, FileDecryptionError];
  if (known.some((type) => error instanceof type)) {
    return { type: (error as Error).name, message: (error as Error).message };
  }
  return describeError(error instanceof Error ? error : new Error('non-Error thrown'));
}
