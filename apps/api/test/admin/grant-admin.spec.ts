// F-ADM-03 : le rôle administrateur ne s'attribue que par script (`grantAdmin`/`revokeAdmin`).
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  GrantAdminError,
  grantAdmin,
  loadGrantAdminConfig,
  revokeAdmin,
} from '../../src/admin/grant-admin.js';
import { openSecret } from '../../src/admin/secret-box.js';
import { auditLog, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { ConfigError } from '../../src/config/env.js';
import { ADMIN_TOTP_KEY } from '../support/admin.js';
import { TEST_ENV } from '../support/app.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

const now = new Date(Date.UTC(2026, 11, 17, 8, 0, 0));
const { pool, db } = testDb();

afterAll(async () => {
  await pool.promise().end();
});

const account = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!;

describe('grantAdmin / revokeAdmin', () => {
  it('attribue le rôle, chiffre un nouveau secret TOTP, renvoie l’URI d’enrôlement, audite', async () => {
    const u = await createUser(db, now);
    const first = await grantAdmin(db, ADMIN_TOTP_KEY, `  ${u.email.toUpperCase()} `, now);
    expect(first.userId).toBe(u.id);
    const secret = new URL(first.otpauthUri).searchParams.get('secret')!;
    const row = await account(u.id);
    expect(row.role).toBe('admin');
    expect(row.adminTotpSecret).not.toContain(secret);
    expect(openSecret(ADMIN_TOTP_KEY, row.adminTotpSecret!, u.id)).toBe(secret);

    // Réattribution = réenrôlement : nouveau secret, dernier pas effacé.
    await db.update(user).set({ adminTotpLastStep: 42 }).where(eq(user.id, u.id));
    const second = await grantAdmin(db, ADMIN_TOTP_KEY, u.email, now);
    expect(new URL(second.otpauthUri).searchParams.get('secret')).not.toBe(secret);
    expect((await account(u.id)).adminTotpLastStep).toBeNull();

    const audit = await db.select().from(auditLog).where(eq(auditLog.targetId, u.id));
    expect(audit.map((a) => [a.action, a.actorUserId, a.targetType])).toEqual([
      ['admin.grant', null, 'user'],
      ['admin.grant', null, 'user'],
    ]);
  });

  it('refuse un compte inconnu ou non vérifié, sans le nommer', async () => {
    const unverified = await createUser(db, now, { verified: false });
    await expect(grantAdmin(db, ADMIN_TOTP_KEY, unverified.email, now)).rejects.toThrow(
      new GrantAdminError('Adresse e-mail non vérifiée'),
    );
    expect((await account(unverified.id)).role).toBe('user');
    const social = await createUser(db, now);
    await db.update(user).set({ passwordHash: null }).where(eq(user.id, social.id));
    await expect(grantAdmin(db, ADMIN_TOTP_KEY, social.email, now)).rejects.toThrow(
      new GrantAdminError('Compte sans mot de passe'),
    );
    const unknown = `inconnu.${newId()}@example.test`;
    await expect(grantAdmin(db, ADMIN_TOTP_KEY, unknown, now)).rejects.toThrow(GrantAdminError);
    await expect(revokeAdmin(db, unknown, now)).rejects.toThrow(
      new GrantAdminError('Compte introuvable'),
    );
  });

  it('retire le rôle et efface le secret', async () => {
    const u = await createUser(db, now);
    await grantAdmin(db, ADMIN_TOTP_KEY, u.email, now);
    expect(await revokeAdmin(db, u.email, now)).toBe(u.id);
    const row = await account(u.id);
    expect([row.role, row.adminTotpSecret, row.adminTotpLastStep]).toEqual(['user', null, null]);
  });

  it('configuration du script : DATABASE_URL et ADMIN_TOTP_KEY obligatoires', () => {
    expect(() => loadGrantAdminConfig({ DATABASE_URL: TEST_ENV.DATABASE_URL })).toThrow(
      ConfigError,
    );
    expect(loadGrantAdminConfig(TEST_ENV).totpKey).toEqual(ADMIN_TOTP_KEY);
  });
});
