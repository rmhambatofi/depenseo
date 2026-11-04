// Lecture des carnets d'un compte (adhésions actives), pour les assertions.
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../src/db/connection.js';
import { notebook, notebookMember } from '../../src/db/schema/index.js';

export function notebooksOf(db: Database, userId: string) {
  return db
    .select({
      id: notebook.id,
      name: notebook.name,
      kind: notebook.kind,
      ownerId: notebook.ownerId,
      role: notebookMember.role,
    })
    .from(notebookMember)
    .innerJoin(notebook, eq(notebook.id, notebookMember.notebookId))
    .where(and(eq(notebookMember.userId, userId), isNull(notebookMember.deletedAt)))
    .orderBy(asc(notebook.id));
}
