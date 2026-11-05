// Jeton d'accès OAuth 2.0 d'un compte de service Google, obtenu par assertion JWT RS256 (flux
// « jwt-bearer ») et mis en cache jusqu'à une minute avant son expiration. Partagé par FCM (push)
// et Google Play Developer API (abonnements, ADR-040).
import { importPKCS8, SignJWT } from 'jose';
import type { Clock } from '../clock.js';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount {
  clientEmail: string;
  /** Clé PKCS#8 (PEM) du compte de service. */
  privateKey: string;
  tokenUrl: string;
}

export class ServiceAccountToken {
  private cached?: { value: string; expiresAt: number };

  constructor(
    private readonly account: ServiceAccount,
    private readonly scope: string,
    private readonly clock: Clock,
    /** Nom du service dans les messages d'erreur (aucun secret). */
    private readonly label: string,
  ) {}

  /** Oublie le jeton en cache (réponse 401 de l'API). */
  invalidate(): void {
    this.cached = undefined;
  }

  async get(signal?: AbortSignal): Promise<string> {
    const now = this.clock.now().getTime();
    if (this.cached && now < this.cached.expiresAt) return this.cached.value;
    const key = await importPKCS8(this.account.privateKey, 'RS256');
    const iat = Math.floor(now / 1000);
    const assertion = await new SignJWT({ scope: this.scope })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.account.clientEmail)
      .setAudience(this.account.tokenUrl)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key);
    const response = await fetch(this.account.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`Jeton OAuth ${this.label} refusé (${response.status})`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string') {
      throw new Error(`Jeton OAuth ${this.label} illisible`);
    }
    const ttl = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.cached = { value: body.access_token, expiresAt: now + (ttl - 60) * 1000 };
    return body.access_token;
  }
}
