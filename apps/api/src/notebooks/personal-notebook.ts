// Carnet personnel (§8.3, P1-09) : tout compte en possède un, créé dans la transaction qui crée le
// compte (inscription par e-mail ou première connexion Apple/Google). ADR-021.
import type { Tx } from '../auth/session.service.js';
import type { Database } from '../db/connection.js';
import { notebook, notebookMember } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';

/** Nom par défaut, dans la langue du compte ; modifiable plus tard (hors MVP : pas de route). */
const PERSONAL_NOTEBOOK_NAMES: Record<string, string> = { fr: 'Mon carnet', en: 'My notebook' };

export async function createPersonalNotebook(
  tx: Tx | Database,
  { userId, language, now }: { userId: string; language: string; now: Date },
): Promise<string> {
  const id = newId();
  await tx.insert(notebook).values({
    id,
    name: PERSONAL_NOTEBOOK_NAMES[language] ?? PERSONAL_NOTEBOOK_NAMES.fr!,
    kind: 'personal',
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(notebookMember).values({
    id: newId(),
    notebookId: id,
    userId,
    role: 'owner',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
