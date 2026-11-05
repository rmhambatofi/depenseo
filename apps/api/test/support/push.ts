// Faux service push : enregistre les messages, simule un jeton invalide ou une panne.
import { createHash } from 'node:crypto';
import type { Database } from '../../src/db/connection.js';
import { device } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import type {
  PushMessage,
  PushResult,
  PushSender,
  PushTarget,
} from '../../src/notifications/push-sender.js';

export class FakePushSender implements PushSender {
  readonly sent: Array<{ target: PushTarget; message: PushMessage }> = [];
  readonly invalidTokens = new Set<string>();
  readonly failingTokens = new Set<string>();

  send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (this.failingTokens.has(target.token)) return Promise.reject(new Error('push indisponible'));
    if (this.invalidTokens.has(target.token)) return Promise.resolve('invalid_token');
    this.sent.push({ target, message });
    return Promise.resolve('sent');
  }

  to(token: string): PushMessage[] {
    return this.sent.filter((s) => s.target.token === token).map((s) => s.message);
  }
}

/** Insère un appareil de test ; renvoie son jeton push. */
export async function insertDevice(
  db: Database,
  userId: string,
  platform: 'ios' | 'android',
  stamp: Date,
): Promise<string> {
  const token = `tok-${newId()}`;
  await db.insert(device).values({
    id: newId(),
    userId,
    platform,
    pushToken: token,
    pushTokenHash: createHash('sha256').update(token).digest(),
    createdAt: stamp,
    updatedAt: stamp,
  });
  return token;
}
