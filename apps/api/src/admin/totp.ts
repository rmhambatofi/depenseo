// Double authentification des administrateurs (F-ADM-01, ADR-042) : TOTP RFC 6238, HMAC-SHA-1,
// 6 chiffres, pas de 30 s, tolérance ±1 pas (dérive d'horloge du téléphone). Pas de dépendance :
// RFC 4226 tient en quelques lignes sur node:crypto.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_S = 30;
const DIGITS = 6;
const WINDOW = 1;
const CODE = /^[0-9]{6}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 RFC 4648 sans bourrage (format attendu par les applications d'authentification). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('base32 invalide');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits (taille recommandée par RFC 4226 §4), en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Code HOTP (RFC 4226) du pas `step`. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_S);
}

/**
 * Pas TOTP auquel correspond `code` (pas courant ±1), ou `undefined`. L'appelant doit refuser un pas
 * déjà consommé (rejeu) : voir `admin_totp_last_step`.
 */
export function verifyTotp(secret: string, code: string, now: Date): number | undefined {
  if (!CODE.test(code)) return undefined;
  const current = totpStep(now);
  let found: number | undefined;
  // Toutes les comparaisons sont faites : durée indépendante du pas trouvé.
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) found ??= step;
  }
  return found;
}

/** URI `otpauth://` (format Key Uri de Google Authenticator) à afficher en QR code. */
export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Depenseo:${email}`);
  const query = new URLSearchParams({
    secret,
    issuer: 'Depenseo',
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_S),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
