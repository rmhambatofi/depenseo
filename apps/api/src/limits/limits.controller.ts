// Routes de la limite globale d'un carnet (F-LIM-01/02/05/09, ADR-027). Garde de carnet sur
// chaque route ; une version d'un autre carnet est introuvable (filtre `notebook_id` du service).
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { LIMIT_PERIOD_KINDS, type LimitPeriodKind } from '../db/schema/index.js';
import { parseBody } from '../http/parse-body.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import { parseQuery } from '../http/parse-query.js';
import {
  createLimitSchema,
  currentLimitQuerySchema,
  MAX_LIMIT_AMOUNT,
  MAX_PAST_PERIODS,
  updateLimitSchema,
} from './limit-input.js';
import { type LimitView, LimitsService } from './limits.service.js';
import type { PeriodSummary } from './period-summary.js';
import { type CurrentLimitView, PeriodSummaryService } from './period-summary.service.js';

export class LimitDto implements LimitView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Unités mineures de `currency` ; NULL = aucune limite',
  })
  readonly amount!: number | null;

  @ApiProperty({ example: 'EUR', description: 'Devise du compte à la création (ISO 4217)' })
  readonly currency!: string;

  @ApiProperty({ enum: LIMIT_PERIOD_KINDS })
  readonly periodKind!: LimitPeriodKind;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 31,
    description: 'Mois : 1–31 ; semaine : 1 = lundi … 7',
  })
  readonly startDay!: number;

  @ApiProperty({ description: 'Les dépenses récurrentes comptent dans la limite' })
  readonly includeRecurring!: boolean;

  @ApiProperty({ format: 'date', description: 'Jour de création, fuseau du compte' })
  readonly effectiveDate!: string;

  @ApiProperty({ format: 'date', description: 'Début de la première période couverte' })
  readonly appliesFrom!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt!: Date;
}

export class CreateLimitDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 généré par le client (idempotence)' })
  readonly id!: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_LIMIT_AMOUNT,
    description: 'Unités mineures ; NULL = supprimer la limite à partir d’aujourd’hui',
  })
  readonly amount!: number | null;

  @ApiPropertyOptional({ enum: LIMIT_PERIOD_KINDS, default: 'month' })
  readonly periodKind?: LimitPeriodKind;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 31, default: 1 })
  readonly startDay?: number;

  @ApiPropertyOptional({ default: true })
  readonly includeRecurring?: boolean;
}

export class UpdateLimitDto {
  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: MAX_LIMIT_AMOUNT })
  readonly amount?: number | null;

  @ApiPropertyOptional({ enum: LIMIT_PERIOD_KINDS })
  readonly periodKind?: LimitPeriodKind;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 31 })
  readonly startDay?: number;

  @ApiPropertyOptional()
  readonly includeRecurring?: boolean;
}

export class PeriodSummaryDto implements PeriodSummary {
  @ApiProperty({ format: 'date', description: 'Premier jour (inclus)' })
  readonly start!: string;

  @ApiProperty({ format: 'date', description: 'Dernier jour (inclus)' })
  readonly end!: string;

  @ApiProperty({ enum: LIMIT_PERIOD_KINDS })
  readonly periodKind!: LimitPeriodKind;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 31 })
  readonly startDay!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly limitId!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, description: 'Unités mineures ; NULL = aucune' })
  readonly limit!: number | null;

  @ApiProperty({ example: 'EUR' })
  readonly currency!: string;

  @ApiProperty()
  readonly includeRecurring!: boolean;

  @ApiProperty({ type: 'integer', description: 'Unités mineures de `currency`' })
  readonly spent!: number;

  @ApiProperty({ type: 'integer', nullable: true, description: 'Négatif en cas de dépassement' })
  readonly remaining!: number | null;

  @ApiProperty({ type: 'integer', nullable: true, description: '⌊100 × dépensé / limite⌋' })
  readonly consumedPercent!: number | null;

  @ApiProperty({ type: 'integer', description: 'Jours écoulés, aujourd’hui compris' })
  readonly elapsedDays!: number;

  @ApiProperty({ type: 'integer' })
  readonly totalDays!: number;

  @ApiProperty({ type: 'integer', description: '⌊100 × jours écoulés / jours de la période⌋' })
  readonly elapsedPercent!: number;

  @ApiProperty({ type: String, isArray: true, description: 'Devises non comptées' })
  readonly otherCurrencies!: string[];
}

export class CurrentLimitDto implements CurrentLimitView {
  @ApiProperty({ example: 'Europe/Paris' })
  readonly timeZone!: string;

  @ApiProperty({ format: 'date' })
  readonly today!: string;

  @ApiProperty({ type: PeriodSummaryDto })
  readonly current!: PeriodSummaryDto;

  @ApiProperty({ type: PeriodSummaryDto, isArray: true, description: 'Plus récente d’abord' })
  readonly past!: PeriodSummaryDto[];
}

export class CurrentLimitQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: MAX_PAST_PERIODS, default: 0 })
  readonly past?: string;
}

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';
const NOT_FOUND = 'Carnet ou limite introuvable';

@ApiTags('limits')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/limits')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class LimitsController {
  constructor(
    private readonly limits: LimitsService,
    private readonly summaries: PeriodSummaryService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: LimitDto, isArray: true, description: 'Historique, plus récente d’abord' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  list(@CurrentNotebook() access: NotebookAccess): Promise<LimitDto[]> {
    return this.limits.list(access.notebookId);
  }

  @Get('current')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CurrentLimitDto, description: 'Jauge de la période en cours' })
  @ApiBadRequestResponse({ description: 'Paramètre invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  current(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Query() query: CurrentLimitQueryDto,
  ): Promise<CurrentLimitDto> {
    const { past } = parseQuery(currentLimitQuerySchema, query);
    return this.summaries.current(access.notebookId, principal.userId, past);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: LimitDto, description: 'Nouvelle version, ou existante si rejeu' })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé, ou version déjà créée ce jour' })
  create(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Body() body: CreateLimitDto,
  ): Promise<LimitDto> {
    return this.limits.create(
      access.notebookId,
      principal.userId,
      parseBody(createLimitSchema, body),
    );
  }

  @Patch(':limitId')
  @ApiParam({ name: 'limitId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: LimitDto })
  @ApiBadRequestResponse({ description: 'Corps vide ou invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'Version passée : créer une nouvelle version' })
  update(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Param('limitId') limitId: string,
    @Body() body: UpdateLimitDto,
  ): Promise<LimitDto> {
    return this.limits.update(
      access.notebookId,
      principal.userId,
      limitId,
      parseBody(updateLimitSchema, body),
    );
  }
}
