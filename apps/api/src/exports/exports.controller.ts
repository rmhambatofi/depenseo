// Routes d'export des dépenses d'un carnet (F-EXP-01, ADR-036) : demande, état, téléchargement.
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { parseBody } from '../http/parse-body.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import { EXPORT_CONTENT_TYPES, EXPORT_FORMATS, type ExportFormat } from './export-format.js';
import { exportRequestSchema } from './export-input.js';
import { type ExportState, ExportsService, type ExportView } from './exports.service.js';

const EXPORT_STATES: readonly ExportState[] = ['pending', 'ready', 'expired', 'failed'];

class CreateExportDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 tiré par le client (rejeu sans doublon)' })
  readonly id!: string;

  @ApiProperty({ enum: EXPORT_FORMATS, description: '`xlsx` réservé au Premium' })
  readonly format!: ExportFormat;

  @ApiProperty({ format: 'date', description: 'Premier jour inclus (AAAA-MM-JJ)' })
  readonly from!: string;

  @ApiProperty({ format: 'date', description: 'Dernier jour inclus (AAAA-MM-JJ)' })
  readonly to!: string;
}

class ExportDto implements ExportView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ enum: EXPORT_FORMATS })
  readonly format!: ExportFormat;

  @ApiProperty({ format: 'date' })
  readonly from!: string;

  @ApiProperty({ format: 'date' })
  readonly to!: string;

  @ApiProperty({
    enum: EXPORT_STATES,
    description: '`ready` : téléchargeable jusqu’à `expiresAt` ; `expired` : lien périmé',
  })
  readonly status!: ExportState;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fin de validité du lien (15 min après génération)',
  })
  readonly expiresAt!: string | null;
}

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';
const NOT_FOUND = 'Carnet ou export introuvable (ou export d’un autre compte)';

@ApiTags('exports')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/exports')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiAcceptedResponse({
    type: ExportDto,
    description: 'Demande enregistrée, ou existante si rejeu',
  })
  @ApiBadRequestResponse({ description: 'Corps invalide (format, dates, période inversée)' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiForbiddenResponse({ description: 'Export Excel hors Premium' })
  @ApiNotFoundResponse({ description: 'Carnet introuvable' })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé pour une autre demande' })
  @ApiServiceUnavailableResponse({ description: 'Stockage des fichiers non configuré' })
  create(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Body() body: CreateExportDto,
  ): Promise<ExportDto> {
    return this.exports.request(
      access.notebookId,
      principal.userId,
      parseBody(exportRequestSchema, body),
    );
  }

  @Get(':exportId')
  @ApiParam({ name: 'exportId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ExportDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Param('exportId') exportId: string,
  ): Promise<ExportDto> {
    return this.exports.get(access.notebookId, principal.userId, exportId);
  }

  @Get(':exportId/file')
  @ApiParam({ name: 'exportId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiProduces(EXPORT_CONTENT_TYPES.csv, EXPORT_CONTENT_TYPES.xlsx)
  @ApiOkResponse({
    description: 'Fichier déchiffré (CSV UTF-8 ou classeur Excel)',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: `${NOT_FOUND}, pas encore prêt ou lien expiré` })
  async download(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Param('exportId') exportId: string,
  ): Promise<StreamableFile> {
    const file = await this.exports.download(access.notebookId, principal.userId, exportId);
    return new StreamableFile(file.content, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.content.length,
    });
  }
}
