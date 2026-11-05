// Back-office activé seulement si ADMIN_SESSION_SECRET et ADMIN_TOTP_KEY sont fournies (ADR-042).
import type { AppConfig } from '../config/env.js';
import { AdminSessionTokens } from './admin-session-token.js';

export const ADMIN_SETTINGS = Symbol('ADMIN_SETTINGS');

export interface AdminSettings {
  tokens: AdminSessionTokens;
  /** Clé AES-256 des secrets TOTP (`user.admin_totp_secret`). */
  totpKey: Buffer;
}

export function adminSettings(
  config: Pick<AppConfig, 'ADMIN_SESSION_SECRET' | 'ADMIN_TOTP_KEY'>,
): AdminSettings | null {
  if (!config.ADMIN_SESSION_SECRET || !config.ADMIN_TOTP_KEY) return null;
  return {
    tokens: new AdminSessionTokens(config.ADMIN_SESSION_SECRET),
    totpKey: Buffer.from(config.ADMIN_TOTP_KEY, 'base64'),
  };
}
