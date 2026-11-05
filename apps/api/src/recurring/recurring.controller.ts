// Routes des dépenses récurrentes et de leurs échéances (F-REC-01/03, ADR-032). Garde de carnet sur
// chaque route ; une ressource d'un autre carnet est introuvable (filtre `notebook_id` des services).
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { parseBody } from '../http/parse-body.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import { OccurrencesService } from './occurrences.service.js';
import {
  adjustOccurrenceSchema,
  createRecurringSchema,
  payOccurrenceSchema,
  updateRecurringSchema,
} from './recurring-input.js';
import {
  AdjustOccurrenceDto,
  CreateRecurringDto,
  OccurrenceDto,
  PayOccurrenceDto,
  RecurringDto,
  UpdateRecurringDto,
} from './recurring.dto.js';
import { RecurringService } from './recurring.service.js';

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';
const NOT_FOUND = 'Carnet ou dépense récurrente introuvable';
const OCCURRENCE_NOT_FOUND = 'Carnet ou échéance introuvable';
const INVALID_CATEGORY = 'Catégorie supprimée ou d’un autre carnet';

@ApiTags('recurring-expenses')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/recurring-expenses')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class RecurringController {
  constructor(
    private readonly recurring: RecurringService,
    private readonly occurrences: OccurrencesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: RecurringDto, isArray: true, description: 'Actives, par nom' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  list(@CurrentNotebook() access: NotebookAccess): Promise<RecurringDto[]> {
    return this.recurring.list(access.notebookId);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: RecurringDto, description: 'Créée, ou existante si rejeu' })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé, ou récurrence supprimée' })
  @ApiUnprocessableEntityResponse({ description: `${INVALID_CATEGORY}, ou ponctuelle passée` })
  create(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Body() body: CreateRecurringDto,
  ): Promise<RecurringDto> {
    return this.recurring.create(
      access.notebookId,
      principal.userId,
      parseBody(createRecurringSchema, body),
    );
  }

  @Get(':recurringId')
  @ApiParam({ name: 'recurringId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: RecurringDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(
    @CurrentNotebook() access: NotebookAccess,
    @Param('recurringId') recurringId: string,
  ): Promise<RecurringDto> {
    return this.recurring.get(access.notebookId, recurringId);
  }

  @Patch(':recurringId')
  @ApiParam({ name: 'recurringId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: RecurringDto })
  @ApiBadRequestResponse({ description: 'Corps vide ou invalide (calendrier immuable)' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiUnprocessableEntityResponse({ description: INVALID_CATEGORY })
  update(
    @CurrentNotebook() access: NotebookAccess,
    @Param('recurringId') recurringId: string,
    @Body() body: UpdateRecurringDto,
  ): Promise<RecurringDto> {
    return this.recurring.update(
      access.notebookId,
      recurringId,
      parseBody(updateRecurringSchema, body),
    );
  }

  @Delete(':recurringId')
  @ApiParam({ name: 'recurringId', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Supprimée avec ses échéances en attente, ou déjà supprimée',
  })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  async remove(
    @CurrentNotebook() access: NotebookAccess,
    @Param('recurringId') recurringId: string,
  ): Promise<void> {
    await this.recurring.remove(access.notebookId, recurringId);
  }

  @Get(':recurringId/occurrences')
  @ApiParam({ name: 'recurringId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: OccurrenceDto, isArray: true, description: 'Par date d’échéance' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  occurrencesOf(
    @CurrentNotebook() access: NotebookAccess,
    @Param('recurringId') recurringId: string,
  ): Promise<OccurrenceDto[]> {
    return this.occurrences.list(access.notebookId, recurringId);
  }
}

@ApiTags('recurring-expenses')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/occurrences')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class OccurrencesController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Patch(':occurrenceId')
  @ApiParam({ name: 'occurrenceId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: OccurrenceDto, description: 'Montant ajusté' })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: OCCURRENCE_NOT_FOUND })
  @ApiConflictResponse({ description: 'Échéance déjà payée ou sautée' })
  adjust(
    @CurrentNotebook() access: NotebookAccess,
    @Param('occurrenceId') occurrenceId: string,
    @Body() body: AdjustOccurrenceDto,
  ): Promise<OccurrenceDto> {
    return this.occurrences.adjust(
      access.notebookId,
      occurrenceId,
      parseBody(adjustOccurrenceSchema, body),
    );
  }

  @Post(':occurrenceId/pay')
  @ApiParam({ name: 'occurrenceId', format: 'uuid' })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: OccurrenceDto, description: 'Payée (dépense créée), ou rejeu' })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: OCCURRENCE_NOT_FOUND })
  @ApiConflictResponse({ description: 'Déjà payée (autre dépense) ou sautée ; identifiant pris' })
  @ApiUnprocessableEntityResponse({ description: INVALID_CATEGORY })
  pay(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Param('occurrenceId') occurrenceId: string,
    @Body() body: PayOccurrenceDto,
  ): Promise<OccurrenceDto> {
    return this.occurrences.pay(
      access.notebookId,
      principal.userId,
      occurrenceId,
      parseBody(payOccurrenceSchema, body),
    );
  }

  @Post(':occurrenceId/skip')
  @ApiParam({ name: 'occurrenceId', format: 'uuid' })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: OccurrenceDto, description: 'Sautée, ou déjà sautée' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: OCCURRENCE_NOT_FOUND })
  @ApiConflictResponse({ description: 'Échéance déjà payée' })
  skip(
    @CurrentNotebook() access: NotebookAccess,
    @Param('occurrenceId') occurrenceId: string,
  ): Promise<OccurrenceDto> {
    return this.occurrences.skip(access.notebookId, occurrenceId);
  }
}
