// Comptes de test créés directement en base (sans passer par l'inscription et la file d'e-mails),
// avec leur carnet personnel comme un vrai compte.
import { hashPassword } from '../../src/auth/password.js';
import type { Database } from '../../src/db/connection.js';
import { user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { createPersonalNotebook } from '../../src/notebooks/personal-notebook.js';

export const TEST_PASSWORD = 'correct horse battery';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Carnet personnel, créé comme à l'inscription. */
  notebookId: string;
}

/** Empreinte calculée une fois : argon2 coûte ~50 ms par appel. */
let passwordHash: Promise<string> | undefined;

export async function createUser(
  db: Database,
  now: Date,
  options: { verified?: boolean } = {},
): Promise<TestUser> {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  const id = newId();
  const email = `compte.${id}@example.test`;
  await db.insert(user).values({
    id,
    email,
    passwordHash: await passwordHash,
    emailVerifiedAt: options.verified === false ? null : now,
    termsAcceptedAt: now,
    privacyAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const notebookId = await createPersonalNotebook(db, { userId: id, language: 'fr', now });
  return { id, email, password: TEST_PASSWORD, notebookId };
}
