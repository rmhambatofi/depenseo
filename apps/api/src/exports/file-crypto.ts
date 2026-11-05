// Chiffrement des fichiers écrits sur le disque de l'hébergement (NF-SEC-01, §8.1, ADR-036) :
// AES-256-GCM, IV aléatoire de 96 bits par fichier, identifiant du fichier en données associées
// (un fichier renommé ou échangé ne se déchiffre pas). Format : « DPF1 » ‖ IV(12) ‖ tag(16) ‖ chiffré.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('DPF1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES + TAG_BYTES;

/** Fichier illisible : clé, identifiant ou contenu ne correspondent pas (sans plus de détail). */
export class FileDecryptionError extends Error {
  override readonly name = 'FileDecryptionError';
  constructor() {
    super('Fichier chiffré illisible');
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new RangeError('Clé AES-256 attendue (32 octets)');
}

export function encryptFile(key: Buffer, fileId: string, plaintext: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(fileId, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptFile(key: Buffer, fileId: string, sealed: Buffer): Buffer {
  assertKey(key);
  if (sealed.length < HEADER_BYTES || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new FileDecryptionError();
  }
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = sealed.subarray(MAGIC.length + IV_BYTES, HEADER_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(fileId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed.subarray(HEADER_BYTES)), decipher.final()]);
  } catch {
    throw new FileDecryptionError();
  }
}
