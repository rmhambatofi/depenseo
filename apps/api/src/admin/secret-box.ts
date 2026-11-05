// Chiffrement d'un secret court en base (secret TOTP, §8.3, ADR-042) : AES-256-GCM, IV aléatoire de
// 96 bits, données associées = identifiant de la ligne (un secret recopié sur un autre compte ne se
// déchiffre pas). Format : `v1.` + base64url(iv ‖ tag ‖ chiffré).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1.';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function sealSecret(key: Buffer, plaintext: string, associatedData: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return VERSION + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** Secret en clair, ou `undefined` si le format, la clé ou les données associées ne collent pas. */
export function openSecret(
  key: Buffer,
  sealed: string,
  associatedData: string,
): string | undefined {
  if (!sealed.startsWith(VERSION)) return undefined;
  const raw = Buffer.from(sealed.slice(VERSION.length), 'base64url');
  if (raw.length <= IV_BYTES + TAG_BYTES) return undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const body = raw.subarray(IV_BYTES + TAG_BYTES);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}
