// Route du tableau de bord d'un carnet (F-TB-01/02, ADR-031) : lecture seule, garde de carnet.
import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { ExpenseDto } from '../expenses/expenses.controller.js';
import { PeriodSummaryDto } from '../limits/limits.controller.js';
import { OccurrenceDto } from '../recurring/recurring.dto.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import type { CategoryShare, CumulativePoint } from './dashboard.js';
import {
  type DashboardView,
  DashboardService,
  EVOLUTION_PERIODS,
  RECENT_EXPENSES,
  UPCOMING_DAYS,
  UPCOMING_OCCURRENCES,
  type UpcomingOccurrence,
} from './dashboard.service.js';

export class UpcomingOccurrenceDto extends OccurrenceDto implements UpcomingOccurrence {
  @ApiProperty({ description: 'Date d’échéance passée (fuseau du compte)' })
  readonly overdue!: boolean;
}

export class CategoryShareDto implements CategoryShare {
  @ApiProperty({ format: 'uuid', description: 'Catégorie racine' })
  readonly categoryId!: string;

  @ApiProperty({ type: 'integer', description: 'Unités mineures de la devise de la jauge' })
  readonly total!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 100, description: '⌊100 × part⌋' })
  readonly percent!: number;
}

export class CumulativePointDto implements CumulativePoint {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'Rang du jour dans la période' })
  readonly day!: number;

  @ApiProperty({ format: 'date' })
  readonly date!: string;

  @ApiProperty({ type: 'integer', description: 'Unités mineures, cumul au jour inclus' })
  readonly cumulative!: number;
}

export class CumulativeDto {
  @ApiProperty({ type: CumulativePointDto, isArray: true, description: 'Jusqu’à aujourd’hui' })
  readonly current!: CumulativePointDto[];

  @ApiProperty({ type: CumulativePointDto, isArray: true, description: 'Période entière' })
  readonly previous!: CumulativePointDto[];
}

export class DashboardDto implements DashboardView {
  @ApiProperty({ example: 'Europe/Paris' })
  readonly timeZone!: string;

  @ApiProperty({ format: 'date' })
  readonly today!: string;

  @ApiProperty({
    type: PeriodSummaryDto,
    description: 'Période en cours ; limit NULL = sans limite',
  })
  readonly gauge!: PeriodSummaryDto;

  @ApiProperty({ type: ExpenseDto, isArray: true, maxItems: RECENT_EXPENSES })
  readonly recent!: ExpenseDto[];

  @ApiProperty({
    type: UpcomingOccurrenceDto,
    isArray: true,
    maxItems: UPCOMING_OCCURRENCES,
    description: `Échéances en attente dues d’ici ${UPCOMING_DAYS} jours, en retard comprises`,
  })
  readonly upcoming!: UpcomingOccurrenceDto[];

  @ApiProperty({ type: CategoryShareDto, isArray: true, description: 'Total décroissant' })
  readonly categories!: CategoryShareDto[];

  @ApiProperty({ type: CumulativeDto })
  readonly cumulative!: CumulativeDto;

  @ApiProperty({
    type: PeriodSummaryDto,
    isArray: true,
    minItems: EVOLUTION_PERIODS,
    maxItems: EVOLUTION_PERIODS,
    description: 'En cours d’abord',
  })
  readonly evolution!: PeriodSummaryDto[];
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/dashboard')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: DashboardDto, description: 'Tableau de bord du carnet' })
  @ApiUnauthorizedResponse({ description: 'Jeton d’accès absent, invalide ou expiré' })
  @ApiNotFoundResponse({ description: 'Carnet introuvable' })
  get(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
  ): Promise<DashboardDto> {
    return this.dashboard.get(access.notebookId, principal.userId);
  }
}
