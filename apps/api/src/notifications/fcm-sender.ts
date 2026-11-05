// Envoi par Firebase Cloud Messaging, API HTTP v1 (§8, F-NOT-01). Jeton d'accès OAuth 2.0 obtenu
// par assertion JWT RS256 du compte de service (portée firebase.messaging), mis en cache jusqu'à
// une minute avant son expiration. Corps sans montant ; jeton d'appareil absent des erreurs.
import { importPKCS8, SignJWT } from 'jose';
import type { Clock } from '../clock.js';
import type { PushMessage, PushResult, PushSender, PushTarget } from './push-sender.js';

export const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_API_ORIGIN = 'https://fcm.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** Clé PKCS#8 (PEM) du compte de service. */
  privateKey: string;
  tokenUrl: string;
  apiOrigin: string;
}

interface FcmError {
  error?: { message?: string; details?: Array<{ errorCode?: string }> };
}

export function fcmBody(token: string, message: PushMessage): string {
  return JSON.stringify({
    message: {
      token,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: { priority: 'HIGH' },
    },
  });
}

export class FcmPushSender implements PushSender {
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    private readonly config: FcmConfig,
    private readonly clock: Clock,
  ) {}

  async send(target: PushTarget, message: PushMessage, signal?: AbortSignal): Promise<PushResult> {
    const access = await this.token(signal);
    const response = await fetch(
      `${this.config.apiOrigin}/v1/projects/${encodeURIComponent(this.config.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
        body: fcmBody(target.token, message),
        signal: signal ?? null,
      },
    );
    if (response.ok) return 'sent';
    const error = ((await response.json().catch(() => ({}))) as FcmError).error;
    const codes = (error?.details ?? []).map((d) => d.errorCode);
    // 404 seul (projet ou URL erronés) : erreur de configuration, surtout pas une suppression d'appareils.
    if (codes.includes('UNREGISTERED')) return 'invalid_token';
    if (response.status === 400 && /registration token/i.test(error?.message ?? '')) {
      return 'invalid_token';
    }
    if (response.status === 401) this.accessToken = undefined;
    throw new Error(`FCM a répondu ${response.status} ${codes.join(',')}`);
  }

  private async token(signal?: AbortSignal): Promise<string> {
    const now = this.clock.now().getTime();
    if (this.accessToken && now < this.accessToken.expiresAt) return this.accessToken.value;
    const key = await importPKCS8(this.config.privateKey, 'RS256');
    const iat = Math.floor(now / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.config.clientEmail)
      .setAudience(this.config.tokenUrl)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key);
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`Jeton OAuth FCM refusé (${response.status})`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string') throw new Error('Jeton OAuth FCM illisible');
    const ttl = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.accessToken = { value: body.access_token, expiresAt: now + (ttl - 60) * 1000 };
    return body.access_token;
  }
}
