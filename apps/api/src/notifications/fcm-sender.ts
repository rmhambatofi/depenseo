// Envoi par Firebase Cloud Messaging, API HTTP v1 (§8, F-NOT-01). Jeton d'accès OAuth 2.0 du compte
// de service (portée firebase.messaging) : `ServiceAccountToken`. Corps sans montant ; jeton
// d'appareil absent des erreurs.
import type { Clock } from '../clock.js';
import { GOOGLE_TOKEN_URL, ServiceAccountToken } from '../google/service-account-token.js';
import type { PushMessage, PushResult, PushSender, PushTarget } from './push-sender.js';

export const FCM_TOKEN_URL = GOOGLE_TOKEN_URL;
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
  private readonly accessToken: ServiceAccountToken;

  constructor(
    private readonly config: FcmConfig,
    clock: Clock,
  ) {
    this.accessToken = new ServiceAccountToken(config, SCOPE, clock, 'FCM');
  }

  async send(target: PushTarget, message: PushMessage, signal?: AbortSignal): Promise<PushResult> {
    const access = await this.accessToken.get(signal);
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
    if (response.status === 401) this.accessToken.invalidate();
    throw new Error(`FCM a répondu ${response.status} ${codes.join(',')}`);
  }
}
