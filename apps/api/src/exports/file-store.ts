// Fichiers chiffrés sur le disque de l'hébergement, hors du dossier public (§8.1, NF-SEC-01,
// ADR-036) : `<FILE_STORAGE_DIR>/<id>.enc`, dossier 0700, fichiers 0600, écriture atomique
// (fichier temporaire puis renommage). Le contenu n'est lisible qu'avec FILE_ENCRYPTION_KEY.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isUuid } from '../db/uuid.js';
import { decryptFile, encryptFile } from './file-crypto.js';

export interface FileStorageConfig {
  readonly FILE_STORAGE_DIR?: string | undefined;
  readonly FILE_ENCRYPTION_KEY?: string | undefined;
}

export class EncryptedFileStore {
  readonly #key: Buffer;

  constructor(
    readonly dir: string,
    key: Buffer,
  ) {
    if (key.length !== 32) throw new RangeError('Clé AES-256 attendue (32 octets)');
    this.#key = key;
  }

  /** Chemin du fichier chiffré ; l'identifiant (UUID) est vérifié : aucune traversée possible. */
  pathOf(id: string): string {
    if (!isUuid(id)) throw new TypeError('Identifiant de fichier invalide');
    return join(this.dir, `${id}.enc`);
  }

  async write(id: string, plaintext: Buffer): Promise<void> {
    const target = this.pathOf(id);
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const temp = join(this.dir, `.${id}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temp, encryptFile(this.#key, id, plaintext), { mode: 0o600, flag: 'wx' });
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  /** Contenu déchiffré, ou `undefined` si le fichier n'existe pas. Lève si illisible. */
  async read(id: string): Promise<Buffer | undefined> {
    let sealed: Buffer;
    try {
      sealed = await readFile(this.pathOf(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    return decryptFile(this.#key, id, sealed);
  }

  async remove(id: string): Promise<void> {
    await rm(this.pathOf(id), { force: true });
  }
}

/** Magasin configuré, ou `undefined` si les variables sont absentes (exports indisponibles). */
export function createFileStore(config: FileStorageConfig): EncryptedFileStore | undefined {
  if (!config.FILE_STORAGE_DIR || !config.FILE_ENCRYPTION_KEY) return undefined;
  return new EncryptedFileStore(
    config.FILE_STORAGE_DIR,
    Buffer.from(config.FILE_ENCRYPTION_KEY, 'base64'),
  );
}
