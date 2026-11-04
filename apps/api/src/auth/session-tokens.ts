// Jetons de session (NF-SEC-02, ADR-018) : accès = JWT HS256 de 15 min, sans état ;
// rafraîchissement = jeton opaque de 30 jours, haché en base (`refresh_token`), voir SessionService.
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const ACCESS_TOKEN_TTL_S = 15 * 60;
/** Fenêtre glissante : chaque rotation repart pour 30 jours. */
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 3600;

const ISSUER = 'depenseo';
const AUDIENCE = 'depenseo-api';
const ALGORITHM = 'HS256';

const subjectSchema = z.uuid();

export interface SessionTokens {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(userId: string, now: Date): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ACCESS_TOKEN_TTL_S)
      .sign(this.key);
  }

  /**
   * Identifiant du compte porté par un jeton valide à `now`, ou `undefined` (signature, algorithme,
   * émetteur, audience, expiration ou sujet invalide). Expiré dès `exp <= now` (à 15 min pile).
   */
  async verify(token: string, now: Date): Promise<string | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: now,
        requiredClaims: ['sub', 'iat', 'exp'],
      });
      const subject = subjectSchema.safeParse(payload.sub);
      return subject.success ? subject.data : undefined;
    } catch (error) {
      if (error instanceof errors.JOSEError) return undefined;
      throw error;
    }
  }
}
