// Nommage, rotation, configuration et contrôle d'intégrité des exports horaires (P4-08, ADR-039).
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupFileName,
  backupTakenAt,
  loadBackupExportConfig,
  loadBackupRestoreConfig,
  pruneBackups,
} from '../../src/backup/backup-files.js';
import { DUMP_HEADER, DUMP_TRAILER, sqlLiteral } from '../../src/backup/db-dump.js';
import { DumpFormatError, dumpStatements } from '../../src/backup/db-restore.js';
import { ConfigError } from '../../src/config/env.js';

const HOUR = 3_600_000;
const KEY = Buffer.alloc(32, 7).toString('base64');
const URL_OK = 'mysql://depenseo_api:secret@127.0.0.1:3307/depenseo';

describe('nom des exports', () => {
  it('horodatage UTC de l’instantané, aller-retour exact à la seconde', () => {
    const at = Date.UTC(2026, 10, 5, 14, 0, 7);
    expect(backupFileName(at)).toBe('depenseo-20261105T140007Z.sql.gz.enc');
    expect(backupTakenAt(backupFileName(at))).toBe(at);
    expect(backupTakenAt('depenseo-20261105T140007Z.sql.gz')).toBeUndefined();
    expect(backupTakenAt('notes.txt')).toBeUndefined();
  });
});

describe('rotation', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'depenseo-prune-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('supprime les exports plus vieux que la rétention, et eux seuls', async () => {
    const now = Date.UTC(2026, 10, 5, 14, 0, 0);
    const names = {
      old: backupFileName(now - 49 * HOUR),
      edge: backupFileName(now - 48 * HOUR),
      fresh: backupFileName(now - HOUR),
    };
    for (const name of [...Object.values(names), 'notes.txt', '.tmp-abc']) {
      await writeFile(join(dir, name), 'x');
    }
    expect(await pruneBackups(dir, now, 48)).toEqual([names.old]);
    expect((await readdir(dir)).sort()).toEqual(
      ['.tmp-abc', names.edge, names.fresh, 'notes.txt'].sort(),
    );
  });
});

describe('configuration', () => {
  it('export : dossier absolu, clé de 32 octets, rétention 48 h par défaut', () => {
    const config = loadBackupExportConfig({
      DATABASE_URL: URL_OK,
      BACKUP_DIR: '/home/depenseo/backups',
      BACKUP_ENCRYPTION_KEY: KEY,
    });
    expect(config.BACKUP_RETENTION_HOURS).toBe(48);
    expect(() =>
      loadBackupExportConfig({
        DATABASE_URL: URL_OK,
        BACKUP_DIR: 'backups',
        BACKUP_ENCRYPTION_KEY: KEY,
      }),
    ).toThrow(ConfigError);
    expect(() =>
      loadBackupExportConfig({
        DATABASE_URL: URL_OK,
        BACKUP_DIR: '/backups',
        BACKUP_ENCRYPTION_KEY: 'trop-courte',
      }),
    ).toThrow(/BACKUP_ENCRYPTION_KEY : invalide/);
  });

  it('restauration : base cible et clé obligatoires, valeurs jamais recopiées', () => {
    expect(() => loadBackupRestoreConfig({ BACKUP_ENCRYPTION_KEY: KEY })).toThrow(
      /RESTORE_DATABASE_URL : absente/,
    );
    expect(() =>
      loadBackupRestoreConfig({ RESTORE_DATABASE_URL: 'pas-une-url', BACKUP_ENCRYPTION_KEY: KEY }),
    ).toThrow(/^(?!.*pas-une-url)/s);
  });
});

describe('intégrité du fichier SQL', () => {
  const body = ['SET FOREIGN_KEY_CHECKS = 0;', '', 'CREATE TABLE `t` (`id` int);'];

  it('ne garde que les instructions entre l’en-tête et la marque de fin', () => {
    const dump = [`${DUMP_HEADER} 2026-11-05T14:00:00.000Z`, ...body, DUMP_TRAILER, ''].join('\n');
    expect(dumpStatements(dump)).toEqual([body[0], body[2]]);
  });

  it('refuse un export tronqué ou sans en-tête avant toute écriture', () => {
    const truncated = [`${DUMP_HEADER} 2026-11-05T14:00:00.000Z`, ...body].join('\n');
    expect(() => dumpStatements(truncated)).toThrow(DumpFormatError);
    expect(() => dumpStatements([...body, DUMP_TRAILER].join('\n'))).toThrow(DumpFormatError);
    expect(() => dumpStatements('')).toThrow(DumpFormatError);
  });
});

describe('littéraux SQL de l’export', () => {
  it('recopie chaînes, entiers sûrs, binaires et NULL sur une seule ligne', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(42)).toBe('42');
    expect(sqlLiteral('9223372036854775807')).toBe("'9223372036854775807'");
    expect(sqlLiteral("a'b\nc\\")).toBe("'a\\'b\\nc\\\\'");
    expect(sqlLiteral(Buffer.from([0x00, 0xff]))).toBe("X'00ff'");
  });

  it('refuse tout autre type plutôt que de corrompre la sauvegarde', () => {
    for (const value of [{ k: 'v' }, [1], 1.5, 2 ** 60, true, new Date(0), 1n, undefined]) {
      expect(() => sqlLiteral(value), typeof value).toThrow(TypeError);
    }
  });
});
