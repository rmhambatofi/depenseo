// Routes de l'export RGPD du compte connecté (F-AUTH-08, ADR-038) : demande, état, téléchargement.
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import type { ExportState } from '../exports/exports.service.js';
import { parseBody } from '../http/parse-body.js';
import {
  ACCOUNT_EXPORT_CONTENT_TYPE,
  accountExportRequestSchema,
  AccountExportService,
  type AccountExportView,
} from './account-export.service.js';

const EXPORT_STATES: readonly ExportState[] = ['pending', 'ready', 'expired', 'failed'];

class CreateAccountExportDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 tiré par le client (rejeu sans doublon)' })
  readonly id!: string;
}

class AccountExportDto implements AccountExportView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

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
const NOT_FOUND = 'Export introuvable (ou d’un autre compte)';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me/export')
export class AccountExportController {
  constructor(private readonly exports: AccountExportService) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiAcceptedResponse({
    type: AccountExportDto,
    description: 'Demande enregistrée (archive zip JSON + CSV), ou existante si rejeu',
  })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé' })
  @ApiServiceUnavailableResponse({ description: 'Stockage des fichiers non configuré' })
  create(
    @CurrentUser() principal: Principal,
    @Body() body: CreateAccountExportDto,
  ): Promise<AccountExportDto> {
    return this.exports.request(principal.userId, parseBody(accountExportRequestSchema, body));
  }

  @Get(':exportId')
  @ApiParam({ name: 'exportId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountExportDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(
    @CurrentUser() principal: Principal,
    @Param('exportId') exportId: string,
  ): Promise<AccountExportDto> {
    return this.exports.get(principal.userId, exportId);
  }

  @Get(':exportId/file')
  @ApiParam({ name: 'exportId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiProduces(ACCOUNT_EXPORT_CONTENT_TYPE)
  @ApiOkResponse({
    description: 'Archive zip déchiffrée (depenseo.json, csv/<table>.csv, LISEZMOI.txt)',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: `${NOT_FOUND}, pas encore prêt ou lien expiré` })
  async download(
    @CurrentUser() principal: Principal,
    @Param('exportId') exportId: string,
  ): Promise<StreamableFile> {
    const content = await this.exports.download(principal.userId, exportId);
    return new StreamableFile(content, {
      type: ACCOUNT_EXPORT_CONTENT_TYPE,
      disposition: 'attachment; filename="depenseo_donnees.zip"',
      length: content.length,
    });
  }
}
