// Garde générique d'accès aux carnets (NF-SEC-03, §8.3, ADR-021). À poser par `@UseGuards` sur
// toute route dont le chemin porte `:notebookId` ; s'exécute après `AccessTokenGuard` (globale).
// Accès = adhésion active (`notebook_member.deleted_at IS NULL`) à un carnet non supprimé. Carnet
// d'autrui, inexistant ou identifiant mal formé : même 404, l'existence d'un carnet ne fuit pas.
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import type { Principal } from '../auth/access-token.guard.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { type MemberRole, notebook, notebookMember } from '../db/schema/index.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';

export const NOTEBOOK_NOT_FOUND = 'Carnet introuvable';

export interface NotebookAccess {
  notebookId: string;
  role: MemberRole;
}

interface NotebookRequest extends Request {
  principal?: Principal;
  notebookAccess?: NotebookAccess;
}

export async function findNotebookAccess(
  db: Database,
  userId: string,
  notebookId: string,
): Promise<NotebookAccess | undefined> {
  if (!isUuid(notebookId)) return undefined;
  const [row] = await db
    .select({ notebookId: notebook.id, role: notebookMember.role })
    .from(notebookMember)
    .innerJoin(notebook, eq(notebook.id, notebookMember.notebookId))
    .where(
      and(
        eq(notebookMember.notebookId, notebookId),
        eq(notebookMember.userId, userId),
        isNull(notebookMember.deletedAt),
        isNull(notebook.deletedAt),
      ),
    );
  return row;
}

@Injectable()
export class NotebookAccessGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<NotebookRequest>();
    const { principal } = request;
    const notebookId = request.params.notebookId;
    // Erreurs de câblage (route publique, chemin sans `:notebookId`) : 500, jamais un accès.
    if (!principal) throw new Error('NotebookAccessGuard sur une route publique');
    if (typeof notebookId !== 'string') throw new Error('NotebookAccessGuard sans :notebookId');
    const access = await findNotebookAccess(this.db, principal.userId, notebookId);
    if (!access) throw new ProblemException(404, NOTEBOOK_NOT_FOUND);
    request.notebookAccess = access;
    return true;
  }
}

/** Carnet vérifié par `NotebookAccessGuard` (identifiant et rôle du compte connecté). */
export const CurrentNotebook = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const access = context.switchToHttp().getRequest<NotebookRequest>().notebookAccess;
  if (!access) throw new Error('CurrentNotebook sans NotebookAccessGuard');
  return access;
});
