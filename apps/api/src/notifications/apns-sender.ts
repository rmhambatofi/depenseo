// Envoi par Apple Push Notification service (§8, F-NOT-01) : HTTP/2, jeton fournisseur ES256 signé
// par la clé `.p8` (renouvelé toutes les 50 min, Apple le refuse après 1 h). Corps sans montant.
// Le jeton d'appareil n'apparaît dans aucun message d'erreur. Une session HTTP/2 est réutilisée pour
// tout le passage cron (Apple déconseille d'ouvrir une connexion par envoi), puis fermée par `close()`.
import { type ClientHttp2Session, connect } from 'node:http2';
import { importPKCS8, SignJWT } from 'jose';
import type { Clock } from '../clock.js';
import type { PushMessage, PushResult, PushSender, PushTarget } from './push-sender.js';

export const APNS_ORIGINS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** Clé PKCS#8 (PEM) téléchargée depuis le compte développeur Apple. */
  privateKey: string;
  /** Identifiant de l'application (bundle id). */
  topic: string;
  origin: string;
}

const PROVIDER_TOKEN_TTL_MS = 50 * 60_000;
/** Raisons d'un refus définitif du jeton d'appareil (ligne `device` à supprimer). */
const INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered']);

export function apnsBody(message: PushMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
    ...message.data,
  });
}

/** Champ `reason` du corps d'erreur APNs (vide si absent ou illisible). */
function apnsReason(data: string): string {
  try {
    const reason = data ? (JSON.parse(data) as { reason?: unknown }).reason : undefined;
    return typeof reason === 'string' ? reason : '';
  } catch {
    return 'réponse illisible';
  }
}

export class ApnsPushSender implements PushSender {
  private providerToken?: { value: string; issuedAt: number };
  private session?: ClientHttp2Session;

  constructor(
    private readonly config: ApnsConfig,
    private readonly clock: Clock,
  ) {}

  async send(target: PushTarget, message: PushMessage, signal?: AbortSignal): Promise<PushResult> {
    const token = await this.token();
    const { status, reason } = await this.post(target.token, token, apnsBody(message), signal);
    if (status === 200) return 'sent';
    if (status === 410 || (status === 400 && INVALID_TOKEN_REASONS.has(reason))) {
      return 'invalid_token';
    }
    if (status === 403 && reason === 'ExpiredProviderToken') this.providerToken = undefined;
    throw new Error(`APNs a répondu ${status} ${reason}`);
  }

  private async token(): Promise<string> {
    const now = this.clock.now().getTime();
    if (this.providerToken && now - this.providerToken.issuedAt < PROVIDER_TOKEN_TTL_MS) {
      return this.providerToken.value;
    }
    const key = await importPKCS8(this.config.privateKey, 'ES256');
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt(Math.floor(now / 1000))
      .sign(key);
    this.providerToken = { value, issuedAt: now };
    return value;
  }

  private post(
    deviceToken: string,
    providerToken: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<{ status: number; reason: string }> {
    return new Promise((resolve, reject) => {
      const session = this.openSession();
      const fail = (error: Error) => {
        this.dropSession(session);
        reject(
          new Error(`APNs injoignable (${(error as NodeJS.ErrnoException).code ?? 'erreur'})`),
        );
      };
      session.once('error', fail);
      const request = session.request(
        {
          ':method': 'POST',
          ':path': `/3/device/${encodeURIComponent(deviceToken)}`,
          authorization: `bearer ${providerToken}`,
          'apns-topic': this.config.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        },
        signal ? { signal } : {},
      );
      let status = 0;
      let data = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      request.on('data', (chunk: string) => {
        data += chunk;
      });
      request.on('error', fail);
      request.on('end', () => {
        session.off('error', fail);
        resolve({ status, reason: apnsReason(data) });
      });
      request.end(body);
    });
  }

  /** Ferme la session HTTP/2 partagée (fin du passage cron). */
  close(): void {
    this.session?.close();
    this.session = undefined;
  }

  private openSession(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = connect(this.config.origin);
    // Erreur hors requête (connexion coupée au repos) : session abandonnée, rouverte au prochain envoi.
    session.on('error', () => this.dropSession(session));
    session.on('close', () => {
      if (this.session === session) this.session = undefined;
    });
    // Ne retient pas le processus : le passage cron se termine même sans `close()`.
    session.unref();
    this.session = session;
    return session;
  }

  private dropSession(session: ClientHttp2Session): void {
    session.destroy();
    if (this.session === session) this.session = undefined;
  }
}
