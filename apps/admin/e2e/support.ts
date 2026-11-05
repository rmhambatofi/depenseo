// Outils des tests Playwright : comptes créés par le serveur e2e et code TOTP (RFC 6238).
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ACCOUNTS_FILE } from './accounts-file';

export interface E2eAccounts {
  admin: { email: string; password: string; totpSecret: string };
  member: { email: string; password: string };
}

export const accounts = (): E2eAccounts =>
  JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8')) as E2eAccounts;

function base32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('secret TOTP invalide');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** Code à 6 chiffres (HMAC-SHA1, pas de 30 s) pour l'instant présent. */
export function totpNow(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}
