// Carnets du compte connecté (§8.3). Le MVP n'a que le carnet personnel ; le partage (F-PAR) est
// au backlog, mais l'accès passe déjà par l'adhésion (`notebook_member`), pas par le propriétaire.
import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import {
  MEMBER_ROLES,
  type MemberRole,
  NOTEBOOK_KINDS,
  type NotebookKind,
  notebook,
  notebookMember,
} from '../db/schema/index.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from './notebook-access.guard.js';

export class NotebookDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ maxLength: 100 })
  readonly name!: string;

  @ApiProperty({ enum: NOTEBOOK_KINDS })
  readonly kind!: NotebookKind;

  @ApiProperty({ enum: MEMBER_ROLES, description: 'Rôle du compte connecté dans ce carnet' })
  readonly role!: MemberRole;
}

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';

@ApiTags('notebooks')
@ApiBearerAuth()
@Controller('notebooks')
export class NotebooksController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Carnets accessibles au compte (adhésion active, carnet non supprimé), un seul si `notebookId`. */
  private select(userId: string, notebookId?: string) {
    return this.db
      .select({
        id: notebook.id,
        name: notebook.name,
        kind: notebook.kind,
        role: notebookMember.role,
      })
      .from(notebookMember)
      .innerJoin(notebook, eq(notebook.id, notebookMember.notebookId))
      .where(
        and(
          eq(notebookMember.userId, userId),
          notebookId === undefined ? undefined : eq(notebookMember.notebookId, notebookId),
          isNull(notebookMember.deletedAt),
          isNull(notebook.deletedAt),
        ),
      );
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotebookDto, isArray: true })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  async list(@CurrentUser() principal: Principal): Promise<NotebookDto[]> {
    return this.select(principal.userId).orderBy(asc(notebook.createdAt), asc(notebook.id));
  }

  @Get(':notebookId')
  @UseGuards(NotebookAccessGuard)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotebookDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: 'Carnet inexistant, supprimé ou d’un autre compte' })
  async get(
    @CurrentUser() principal: Principal,
    @CurrentNotebook() access: NotebookAccess,
  ): Promise<NotebookDto> {
    const [row] = await this.select(principal.userId, access.notebookId);
    if (!row) throw new Error('Carnet introuvable après la garde');
    return row;
  }
}
