// Jetons envoyés par e-mail (vérification, réinitialisation) : 256 bits aléatoires en base64url ;
// seule l'empreinte SHA-256 est stockée (`email_token.token_hash`, ADR-015).
import { createHash, randomBytes } from 'node:crypto';

/** 32 octets en base64url sans remplissage : 43 caractères. */
export const EMAIL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateEmailToken(): { token: string; tokenHash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashEmailToken(token) };
}

export function hashEmailToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
