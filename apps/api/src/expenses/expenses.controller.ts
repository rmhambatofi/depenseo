// Routes des dépenses d'un carnet (F-DEP-03, F-DEP-10, ADR-024). Garde de carnet sur chaque route ;
// une dépense d'un autre carnet est introuvable (filtre `notebook_id` dans le service).
import { SUPPORTED_CURRENCIES } from '@depenseo/shared';
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
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { EXPENSE_SOURCES } from '../db/schema/index.js';
import { parseBody } from '../http/parse-body.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import {
  createExpenseSchema,
  MAX_EXPENSE_AMOUNT,
  MAX_TAGS_PER_EXPENSE,
  MERCHANT_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  updateExpenseSchema,
} from './expense-input.js';
import { ExpensesService, type ExpenseView } from './expenses.service.js';

const AMOUNT = {
  type: 'integer',
  format: 'int64',
  minimum: 1,
  maximum: MAX_EXPENSE_AMOUNT,
  description: 'Montant en unités mineures (centimes), entier strictement positif',
} as const;
const DATE = { format: 'date', example: '2026-03-29', description: 'Date calendaire, sans fuseau' };
const TAGS = {
  type: String,
  isArray: true,
  maxItems: MAX_TAGS_PER_EXPENSE,
  description: `Noms d’étiquettes (1 à ${TAG_MAX_LENGTH} caractères), dédoublonnés à la casse et aux accents près`,
};

export class ExpenseDto implements ExpenseView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty(AMOUNT)
  readonly amount!: number;

  @ApiProperty({ enum: SUPPORTED_CURRENCIES, description: 'Code ISO 4217' })
  readonly currency!: string;

  @ApiProperty({ format: 'uuid' })
  readonly categoryId!: string;

  @ApiProperty(DATE)
  readonly date!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: NOTE_MAX_LENGTH })
  readonly note!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: MERCHANT_MAX_LENGTH })
  readonly merchant!: string | null;

  @ApiProperty(TAGS)
  readonly tags!: string[];

  @ApiProperty({ enum: EXPENSE_SOURCES })
  readonly source!: string;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  readonly updatedAt!: Date;
}

export class CreateExpenseDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 généré par le client (idempotence)' })
  readonly id!: string;

  @ApiProperty(AMOUNT)
  readonly amount!: number;

  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, description: 'Défaut : devise du compte' })
  readonly currency?: string;

  @ApiProperty({ format: 'uuid', description: 'Catégorie du carnet, masquée acceptée' })
  readonly categoryId!: string;

  @ApiProperty(DATE)
  readonly date!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTE_MAX_LENGTH })
  readonly note?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MERCHANT_MAX_LENGTH })
  readonly merchant?: string | null;

  @ApiPropertyOptional(TAGS)
  readonly tags?: string[];
}

export class UpdateExpenseDto {
  @ApiPropertyOptional(AMOUNT)
  readonly amount?: number;

  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES })
  readonly currency?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  readonly categoryId?: string;

  @ApiPropertyOptional(DATE)
  readonly date?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTE_MAX_LENGTH })
  readonly note?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MERCHANT_MAX_LENGTH })
  readonly merchant?: string | null;

  @ApiPropertyOptional({ ...TAGS, description: `${TAGS.description} ; remplace la liste` })
  readonly tags?: string[];
}

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';
const NOT_FOUND = 'Carnet ou dépense introuvable';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/expenses')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: ExpenseDto, description: 'Créée, ou existante si rejeu' })
  @ApiBadRequestResponse({ description: 'Corps invalide (montant non entier, date…)' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé ailleurs, ou dépense supprimée' })
  @ApiUnprocessableEntityResponse({ description: 'Catégorie invalide' })
  create(
    @CurrentNotebook() access: NotebookAccess,
    @CurrentUser() principal: Principal,
    @Body() body: CreateExpenseDto,
  ): Promise<ExpenseDto> {
    return this.expenses.create(
      access.notebookId,
      principal.userId,
      parseBody(createExpenseSchema, body),
    );
  }

  @Get(':expenseId')
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ExpenseDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: `${NOT_FOUND}, ou supprimée` })
  get(
    @CurrentNotebook() access: NotebookAccess,
    @Param('expenseId') expenseId: string,
  ): Promise<ExpenseDto> {
    return this.expenses.get(access.notebookId, expenseId);
  }

  @Patch(':expenseId')
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ExpenseDto })
  @ApiBadRequestResponse({ description: 'Corps vide ou invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: `${NOT_FOUND}, ou supprimée` })
  @ApiUnprocessableEntityResponse({ description: 'Catégorie invalide' })
  update(
    @CurrentNotebook() access: NotebookAccess,
    @Param('expenseId') expenseId: string,
    @Body() body: UpdateExpenseDto,
  ): Promise<ExpenseDto> {
    return this.expenses.update(access.notebookId, expenseId, parseBody(updateExpenseSchema, body));
  }

  @Delete(':expenseId')
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Supprimée (logiquement), ou déjà supprimée' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  async remove(
    @CurrentNotebook() access: NotebookAccess,
    @Param('expenseId') expenseId: string,
  ): Promise<void> {
    await this.expenses.remove(access.notebookId, expenseId);
  }

  @Post(':expenseId/restore')
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ExpenseDto, description: 'Restaurée, ou déjà active' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  restore(
    @CurrentNotebook() access: NotebookAccess,
    @Param('expenseId') expenseId: string,
  ): Promise<ExpenseDto> {
    return this.expenses.restore(access.notebookId, expenseId);
  }
}
