// Attribution du rôle administrateur (F-ADM-03, ADR-042) : **uniquement** par le script
// `scripts/grant-admin.ts`, jamais par une route. Chaque attribution tire un nouveau secret TOTP
// (réenrôlement) et efface le dernier pas consommé ; le retrait efface le secret.
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { aes256Key, databaseUrl, parseEnv } from '../config/env.js';
import type { Database } from '../db/connection.js';
import { user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { recordAdminAudit } from './admin-audit.js';
import { sealSecret } from './secret-box.js';
import { generateTotpSecret, otpauthUri } from './totp.js';

export class GrantAdminError extends Error {
  override readonly name = 'GrantAdminError';
}

const grantEnv = z.object({
  DATABASE_URL: databaseUrl,
  ADMIN_TOTP_KEY: aes256Key,
});

export function loadGrantAdminConfig(env: Readonly<Record<string, string | undefined>>) {
  const config = parseEnv(grantEnv, env);
  return {
    databaseUrl: config.DATABASE_URL,
    totpKey: Buffer.from(config.ADMIN_TOTP_KEY, 'base64'),
  };
}

async function findAccount(db: Database, email: string) {
  const [account] = await db
    .select({ id: user.id, verifiedAt: user.emailVerifiedAt, passwordHash: user.passwordHash })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .for('update');
  // Message sans l'adresse : la sortie du script peut finir dans un journal.
  if (!account) throw new GrantAdminError('Compte introuvable');
  return account;
}

/** Donne le rôle admin à un compte vérifié ; renvoie l'URI `otpauth://` à enrôler. */
export async function grantAdmin(
  db: Database,
  totpKey: Buffer,
  email: string,
  now: Date,
): Promise<{ userId: string; otpauthUri: string }> {
  return withTransaction(db, async (tx) => {
    const account = await findAccount(tx, email);
    if (!account.verifiedAt) throw new GrantAdminError('Adresse e-mail non vérifiée');
    // Connexion admin = e-mail + mot de passe + TOTP : un compte Apple/Google seul ne pourrait pas.
    if (!account.passwordHash) throw new GrantAdminError('Compte sans mot de passe');
    const secret = generateTotpSecret();
    await tx
      .update(user)
      .set({
        role: 'admin',
        adminTotpSecret: sealSecret(totpKey, secret, account.id),
        adminTotpLastStep: null,
        updatedAt: now,
      })
      .where(eq(user.id, account.id));
    await recordAdminAudit(
      tx,
      { actorUserId: null, action: 'admin.grant', targetType: 'user', targetId: account.id },
      now,
    );
    return { userId: account.id, otpauthUri: otpauthUri(secret, email.trim().toLowerCase()) };
  });
}

/** Retire le rôle et le secret ; les sessions admin en cours échouent dès la requête suivante. */
export async function revokeAdmin(db: Database, email: string, now: Date): Promise<string> {
  return withTransaction(db, async (tx) => {
    const account = await findAccount(tx, email);
    await tx
      .update(user)
      .set({ role: 'user', adminTotpSecret: null, adminTotpLastStep: null, updatedAt: now })
      .where(eq(user.id, account.id));
    await recordAdminAudit(
      tx,
      { actorUserId: null, action: 'admin.revoke', targetType: 'user', targetId: account.id },
      now,
    );
    return account.id;
  });
}
