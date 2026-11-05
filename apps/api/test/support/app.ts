// Démarre l'application complète (préfixe, filtres, journal) avec un flux de journal capturé.
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { createApp, type CreateAppOptions } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { TEST_DATABASE_URL } from './db.js';

export const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-0123',
  DATABASE_URL: TEST_DATABASE_URL,
  APPLE_CLIENT_IDS: 'app.depenseo.ios, app.depenseo.web',
  GOOGLE_CLIENT_IDS: 'depenseo-android.apps.googleusercontent.com',
  /** Dossier propre au processus de test (fichiers d'export chiffrés, ADR-036). */
  FILE_STORAGE_DIR: join(tmpdir(), `depenseo-test-files-${process.pid}`),
  FILE_ENCRYPTION_KEY: 'ZGVwZW5zZW8tdGVzdC1rZXktMzItYnl0ZXMtLS0tLS0=',
  /** Back-office (ADR-042). */
  ADMIN_SESSION_SECRET: 'test-admin-session-secret-0123456789abcdef',
  ADMIN_TOTP_KEY: 'YWRtaW4tdG90cC10ZXN0LWtleS0zMi1ieXRlcy0tLS0=',
} as const;

export class LogCapture extends Writable {
  readonly lines: string[] = [];
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
    done();
  }
  get text(): string {
    return this.lines.join('\n');
  }
}

export async function startTestApp({
  env = {},
  ...options
}: Pick<CreateAppOptions, 'clock' | 'idTokenKeys' | 'storeVerifier' | 'storeNotificationKeys'> & {
  /** Variables ajoutées à `TEST_ENV` (ex. configuration des stores). */
  env?: Record<string, string | undefined>;
} = {}): Promise<{ app: INestApplication; logs: LogCapture }> {
  const logs = new LogCapture();
  const config = loadConfig({ ...TEST_ENV, ...env });
  const app = await createApp(config, { ...options, logDestination: logs });
  await app.init();
  return { app, logs };
}

/** Serveur HTTP typé pour supertest (`getHttpServer` renvoie `any`). */
export function http(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
