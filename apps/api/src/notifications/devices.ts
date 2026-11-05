// Appareils joignables par push (F-NOT-01, ADR-035). L'identifiant est un UUID v7 tiré par
// l'application ; le jeton du service push prouve la possession de l'appareil : un jeton déjà
// enregistré ailleurs (autre compte, ancienne installation) y est retiré. Un identifiant appartenant
// à un autre compte est refusé (409) : l'application en tire un nouveau.
import { createHash } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { device, PUSH_PLATFORMS, PUSH_TOKEN_MAX_LENGTH } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { ProblemException } from '../errors/problem.exception.js';

export const deviceInputSchema = z.strictObject({
  platform: z.enum(PUSH_PLATFORMS),
  token: z
    .string()
    .min(1)
    .max(PUSH_TOKEN_MAX_LENGTH)
    .regex(/^[\x21-\x7e]+$/, 'Jeton ASCII imprimable attendu'),
});
export type DeviceInput = z.infer<typeof deviceInputSchema>;

const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest();

export async function registerDevice(
  db: Database,
  userId: string,
  deviceId: string,
  input: DeviceInput,
  now: Date,
): Promise<void> {
  const hash = tokenHash(input.token);
  await withTransaction(db, async (tx) => {
    const [existing] = await tx
      .select({ userId: device.userId })
      .from(device)
      .where(eq(device.id, deviceId))
      .for('update');
    if (existing && existing.userId !== userId) {
      throw new ProblemException(409, 'Identifiant d’appareil déjà utilisé');
    }
    await tx.delete(device).where(and(eq(device.pushTokenHash, hash), ne(device.id, deviceId)));
    const columns = { platform: input.platform, pushToken: input.token, pushTokenHash: hash };
    await tx
      .insert(device)
      .values({ id: deviceId, userId, ...columns, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { ...columns, updatedAt: now } });
  });
}

/** Désinscription (déconnexion de l'application) : sans effet sur l'appareil d'un autre compte. */
export async function unregisterDevice(
  db: Database,
  userId: string,
  deviceId: string,
): Promise<void> {
  await db.delete(device).where(and(eq(device.id, deviceId), eq(device.userId, userId)));
}
