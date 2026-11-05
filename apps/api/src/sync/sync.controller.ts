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
import {
  LIMIT_PERIOD_KINDS,
  type LimitPeriodKind,
  OCCURRENCE_STATUSES,
  type OccurrenceStatus,
} from '../db/schema/index.js';
import { RecurringDto } from '../recurring/recurring.dto.js';
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
  type SyncLimit,
  type SyncOccurrence,
  type SyncPage,
  type SyncRecurring,
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

export class SyncLimitDto implements SyncLimit {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Unités mineures ; NULL = aucune limite',
  })
  readonly amount!: number | null;

  @ApiProperty({ example: 'EUR' })
  readonly currency!: string;

  @ApiProperty({ enum: LIMIT_PERIOD_KINDS })
  readonly periodKind!: LimitPeriodKind;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 31 })
  readonly startDay!: number;

  @ApiProperty()
  readonly includeRecurring!: boolean;

  @ApiProperty({ format: 'date' })
  readonly effectiveDate!: string;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  readonly updatedAt!: Date;

  @ApiProperty(DELETED_AT)
  readonly deletedAt!: Date | null;
}

export class SyncRecurringDto extends RecurringDto implements SyncRecurring {
  @ApiProperty(DELETED_AT)
  readonly deletedAt!: Date | null;
}

export class SyncOccurrenceDto implements SyncOccurrence {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly recurringExpenseId!: string;

  @ApiProperty({ format: 'date' })
  readonly dueDate!: string;

  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  readonly status!: OccurrenceStatus;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Montant propre à l’échéance ; NULL = montant de la récurrence',
  })
  readonly amount!: number | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly expenseId!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Mode confirmation : échéance due signalée « à confirmer » (F-REC-02)',
  })
  readonly confirmationRequestedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  readonly updatedAt!: Date;

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

  @ApiProperty({ type: [SyncLimitDto], description: 'Versions de la limite globale (ADR-027)' })
  readonly limits!: SyncLimitDto[];

  @ApiProperty({ type: [SyncRecurringDto], description: 'Dépenses récurrentes (ADR-032)' })
  readonly recurringExpenses!: SyncRecurringDto[];

  @ApiProperty({ type: [SyncOccurrenceDto], description: 'Échéances (ADR-032)' })
  readonly occurrences!: SyncOccurrenceDto[];

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
      'Catégories, étiquettes, dépenses, limites, récurrences puis échéances modifiées, suppressions incluses, par (updatedAt, id)',
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
