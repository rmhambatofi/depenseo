// Synchronisation différentielle d'un carnet (NF-OFF-01, §8.2, ADR-026).
import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CategoryDto } from '../categories/categories.controller.js';
import { ExpenseDto } from '../expenses/expenses.controller.js';
import { parseQuery } from '../http/parse-query.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import { DEFAULT_SYNC_PAGE_SIZE, MAX_SYNC_PAGE_SIZE, syncQuerySchema } from './sync-query.js';
import {
  type SyncCategory,
  type SyncExpense,
  type SyncPage,
  SyncService,
  type SyncTag,
} from './sync.service.js';

const DELETED_AT = {
  type: Date,
  format: 'date-time',
  nullable: true,
  description: 'Suppression logique ; NULL si active',
} as const;

export class SyncCategoryDto extends CategoryDto implements SyncCategory {
  @ApiProperty({ type: 'integer', description: 'Ordre parmi les sœurs' })
  readonly position!: number;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  readonly updatedAt!: Date;

  @ApiProperty(DELETED_AT)
  readonly deletedAt!: Date | null;
}

export class SyncTagDto implements SyncTag {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ maxLength: 50 })
  readonly name!: string;

  @ApiProperty({ format: 'date-time' })
  readonly updatedAt!: Date;

  @ApiProperty(DELETED_AT)
  readonly deletedAt!: Date | null;
}

export class SyncExpenseDto extends ExpenseDto implements SyncExpense {
  @ApiProperty(DELETED_AT)
  readonly deletedAt!: Date | null;
}

export class SyncPageDto implements SyncPage {
  @ApiProperty({ type: [SyncCategoryDto] })
  readonly categories!: SyncCategoryDto[];

  @ApiProperty({ type: [SyncTagDto] })
  readonly tags!: SyncTagDto[];

  @ApiProperty({ type: [SyncExpenseDto] })
  readonly expenses!: SyncExpenseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Curseur de la page suivante du même parcours ; `null` en fin de parcours',
  })
  readonly nextCursor!: string | null;

  @ApiProperty({
    format: 'date-time',
    description: '`updated_since` du prochain parcours (identique sur toutes les pages)',
  })
  readonly nextUpdatedSince!: Date;
}

/** Paramètres (documentation OpenAPI ; validés par `syncQuerySchema`). */
export class SyncQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-11-04T08:55:00.000Z',
    description:
      'Instant UTC (suffixe Z) inclus ; absent = synchronisation complète. Plus de 29 jours → 410',
  })
  readonly updated_since?: string;

  @ApiPropertyOptional({ description: '`nextCursor` de la page précédente (exclut updated_since)' })
  readonly cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_SYNC_PAGE_SIZE,
    default: DEFAULT_SYNC_PAGE_SIZE,
    description: 'Lignes par page, toutes tables confondues',
  })
  readonly limit?: number;
}

@ApiTags('sync')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/sync')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    type: SyncPageDto,
    description:
      'Catégories, étiquettes puis dépenses modifiées, suppressions incluses, par (updatedAt, id)',
  })
  @ApiBadRequestResponse({ description: 'Paramètre inconnu ou invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton d’accès absent, invalide ou expiré' })
  @ApiNotFoundResponse({ description: 'Carnet introuvable' })
  @ApiGoneResponse({ description: 'updated_since trop ancien : synchronisation complète requise' })
  changes(
    @CurrentNotebook() access: NotebookAccess,
    @Query() query: SyncQueryDto,
  ): Promise<SyncPageDto> {
    return this.sync.changes(access.notebookId, parseQuery(syncQuerySchema, query));
  }
}
