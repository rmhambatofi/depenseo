// Vérification des `id_token` Apple et Google (F-AUTH-02, ADR-020) : signature par les clés
// publiques (JWKS) du fournisseur, `iss`, `aud`, `exp` et `nonce`. Interface `IdTokenVerifier`
// pour isoler le service de connexion de jose et des fournisseurs.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Clock } from '../clock.js';
import type { AppConfig } from '../config/env.js';
import type { IdentityProvider } from '../db/schema/index.js';

export interface VerifiedIdentity {
  provider: IdentityProvider;
  /** Claim `sub` : identifiant stable du compte chez le fournisseur. */
  subject: string;
  /** Adresse normalisable, présente seulement si le fournisseur l'atteste vérifiée. */
  verifiedEmail?: string;
  /**
   * Le fournisseur fait autorité sur l'adresse (condition du rattachement à un compte existant) :
   * Apple ; Google seulement pour Gmail ou un compte Workspace (claim `hd`), car il ne revérifie
   * pas une adresse tierce, qui a pu changer de titulaire depuis la création du compte Google.
   */
  emailAuthoritative: boolean;
}

export interface IdTokenVerifier {
  /**
   * Vérifie le jeton et que son claim `nonce` vaut le SHA-256 (hexadécimal) de `rawNonce`.
   * Lève `InvalidIdTokenError` si le jeton est refusé, `ProviderUnavailableError` si le
   * fournisseur n'est pas configuré.
   */
  verify(provider: IdentityProvider, idToken: string, rawNonce: string): Promise<VerifiedIdentity>;
}

export const ID_TOKEN_VERIFIER = Symbol('ID_TOKEN_VERIFIER');

/** Âge maximal d'un `id_token` (depuis `iat`) et tolérance d'horloge, en secondes. */
export const MAX_TOKEN_AGE_S = 600;
export const CLOCK_TOLERANCE_S = 5;

export class InvalidIdTokenError extends Error {
  override readonly name = 'InvalidIdTokenError';
}
export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';
}

export interface ProviderSettings {
  /** Valeurs acceptées pour `iss`. */
  issuers: readonly string[];
  /** Identifiants de client acceptés pour `aud` (applications iOS, Android, web). */
  audiences: readonly string[];
  keys: JWTVerifyGetKey;
}

export type IdTokenKeys = Partial<Record<IdentityProvider, JWTVerifyGetKey>>;

/** Émetteurs et JWKS publiés par les fournisseurs (documentation Apple et Google Identity). */
const PROVIDERS: Record<IdentityProvider, { issuers: string[]; jwks: string }> = {
  apple: { issuers: ['https://appleid.apple.com'], jwks: 'https://appleid.apple.com/auth/keys' },
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  },
};

/**
 * Réglages des fournisseurs configurés (identifiants de client présents dans l'environnement).
 * `keys` remplace les JWKS distants (tests) ; sinon clés téléchargées et mises en cache par jose.
 */
export function providerSettings(
  config: Pick<AppConfig, 'APPLE_CLIENT_IDS' | 'GOOGLE_CLIENT_IDS'>,
  keys: IdTokenKeys = {},
): Partial<Record<IdentityProvider, ProviderSettings>> {
  const audiences: Record<IdentityProvider, readonly string[]> = {
    apple: config.APPLE_CLIENT_IDS,
    google: config.GOOGLE_CLIENT_IDS,
  };
  const settings: Partial<Record<IdentityProvider, ProviderSettings>> = {};
  for (const provider of Object.keys(PROVIDERS) as IdentityProvider[]) {
    if (audiences[provider].length === 0) continue;
    settings[provider] = {
      issuers: PROVIDERS[provider].issuers,
      audiences: audiences[provider],
      keys:
        keys[provider] ??
        createRemoteJWKSet(new URL(PROVIDERS[provider].jwks), { timeoutDuration: 5000 }),
    };
  }
  return settings;
}

export function nonceHash(rawNonce: string): string {
  return createHash('sha256').update(rawNonce, 'utf8').digest('hex');
}

export class JoseIdTokenVerifier implements IdTokenVerifier {
  constructor(
    private readonly providers: Partial<Record<IdentityProvider, ProviderSettings>>,
    private readonly clock: Clock,
  ) {}

  async verify(
    provider: IdentityProvider,
    idToken: string,
    rawNonce: string,
  ): Promise<VerifiedIdentity> {
    const settings = this.providers[provider];
    if (!settings) throw new ProviderUnavailableError(provider);
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, settings.keys, {
        // Apple et Google signent en RS256 ; tout autre algorithme (dont HS256 et `none`) est refusé.
        algorithms: ['RS256'],
        issuer: [...settings.issuers],
        audience: [...settings.audiences],
        currentDate: this.clock.now(),
        // Fenêtre de rejeu bornée (un `id_token` Google vaut 1 h) ; `iat` futur refusé.
        maxTokenAge: MAX_TOKEN_AGE_S,
        clockTolerance: CLOCK_TOLERANCE_S,
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
      }));
    } catch (error) {
      // JWKS injoignable : erreur serveur (500), pas un refus du jeton.
      if (error instanceof errors.JOSEError && !isNetworkError(error)) {
        throw new InvalidIdTokenError(error.code);
      }
      throw error;
    }
    const { sub, nonce, email, hd } = payload;
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 255) {
      throw new InvalidIdTokenError('sub');
    }
    if (typeof nonce !== 'string' || !sameText(nonce, nonceHash(rawNonce))) {
      throw new InvalidIdTokenError('nonce');
    }
    // Apple publie `email_verified` en booléen ou en chaîne "true" selon les jetons.
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!emailVerified || typeof email !== 'string') {
      return { provider, subject: sub, emailAuthoritative: false };
    }
    const authoritative =
      provider === 'apple' ||
      (typeof hd === 'string' && hd.length > 0) ||
      /@(gmail|googlemail)\.com$/i.test(email);
    return { provider, subject: sub, verifiedEmail: email, emailAuthoritative: authoritative };
  }
}

function isNetworkError(error: errors.JOSEError): boolean {
  return (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    error.code === 'ERR_JOSE_GENERIC'
  );
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
