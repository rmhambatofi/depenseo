// Session du back-office (§8.5, ADR-042) : JWT HS256 sans état porté par un cookie `Path=/admin`,
// clé et audience propres (un jeton d'accès mobile n'ouvre pas le back-office, et inversement).
// Durée absolue de 30 min ; le rôle est relu en base à chaque requête (révocation immédiate).
import { createHash } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const ADMIN_SESSION_TTL_S = 30 * 60;
export const ADMIN_COOKIE = 'depenseo_admin';
/** Le navigateur n'envoie le cookie qu'au back-office et à son API (`/admin/api/*`). */
export const ADMIN_COOKIE_PATH = '/admin';

const ISSUER = 'depenseo';
const AUDIENCE = 'depenseo-admin';
const ALGORITHM = 'HS256';

export interface AdminSession {
  userId: string;
  /** Empreinte de l'enrôlement TOTP en vigueur à la connexion (`enrollmentOf`). */
  enrollment: string;
  expiresAt: Date;
}

/**
 * Empreinte du secret TOTP chiffré : une réattribution (nouveau secret, ex. téléphone perdu) change
 * l'empreinte et invalide aussitôt les sessions ouvertes avec l'ancien secret.
 */
export function enrollmentOf(sealedSecret: string): string {
  return createHash('sha256').update(sealedSecret).digest('base64url').slice(0, 22);
}

export class AdminSessionTokens {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(
    userId: string,
    enrollment: string,
    now: Date,
  ): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + ADMIN_SESSION_TTL_S;
    const token = await new SignJWT({ enr: enrollment })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  async verify(token: string, now: Date): Promise<AdminSession | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: now,
        requiredClaims: ['sub', 'iat', 'exp', 'enr'],
      });
      const subject = z.uuid().safeParse(payload.sub);
      if (!subject.success || typeof payload.enr !== 'string') return undefined;
      return {
        userId: subject.data,
        enrollment: payload.enr,
        expiresAt: new Date(payload.exp! * 1000),
      };
    } catch (error) {
      if (error instanceof errors.JOSEError) return undefined;
      throw error;
    }
  }
}

/** Valeur d'un cookie dans l'en-tête `Cookie` (pas de cookie-parser : un seul cookie utile). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}
