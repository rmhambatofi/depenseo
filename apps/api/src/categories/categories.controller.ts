// Routes des catégories d'un carnet (F-CAT-01/02, ADR-023). Garde de carnet sur chaque route ;
// une catégorie d'un autre carnet est introuvable (filtre `notebook_id` dans le service).
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
  Query,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ProblemException } from '../errors/problem.exception.js';
import { parseBody } from '../http/parse-body.js';
import {
  CurrentNotebook,
  type NotebookAccess,
  NotebookAccessGuard,
} from '../notebooks/notebook-access.guard.js';
import { CategoriesService, type CategoryView } from './categories.service.js';
import { createCategorySchema, updateCategorySchema } from './category-input.js';

export class CategoryDto implements CategoryView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'NULL : racine' })
  readonly parentId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Clé stable du plan par défaut (ex. `housing.rent`), NULL si personnalisée',
  })
  readonly systemKey!: string | null;

  @ApiProperty({ maxLength: 100 })
  readonly name!: string;

  @ApiProperty({ maxLength: 32, description: 'Emoji ou nom d’icône' })
  readonly icon!: string;

  @ApiProperty({ pattern: '^#[0-9A-F]{6}$', example: '#43A047' })
  readonly color!: string;

  @ApiProperty()
  readonly hidden!: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 généré par le client (idempotence)' })
  readonly id!: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  readonly name!: string;

  @ApiProperty({ minLength: 1, maxLength: 32 })
  readonly icon!: string;

  @ApiProperty({ pattern: '^#[0-9a-fA-F]{6}$' })
  readonly color!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  readonly parentId?: string | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  readonly name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 32 })
  readonly icon?: string;

  @ApiPropertyOptional({ pattern: '^#[0-9a-fA-F]{6}$' })
  readonly color?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  readonly parentId?: string | null;

  @ApiPropertyOptional()
  readonly hidden?: boolean;
}

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';
const NOT_FOUND = 'Carnet ou catégorie introuvable';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/categories')
@ApiParam({ name: 'notebookId', format: 'uuid' })
@UseGuards(NotebookAccessGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'includeHidden', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  @ApiBadRequestResponse({ description: '`includeHidden` autre que true/false' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  list(
    @CurrentNotebook() access: NotebookAccess,
    @Query('includeHidden') includeHidden?: string,
  ): Promise<CategoryDto[]> {
    if (includeHidden !== undefined && includeHidden !== 'true' && includeHidden !== 'false') {
      throw new ProblemException(400, 'Champs invalides : includeHidden');
    }
    return this.categories.list(access.notebookId, includeHidden === 'true');
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: CategoryDto, description: 'Créée, ou existante si rejeu' })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé ailleurs ou supprimé' })
  @ApiUnprocessableEntityResponse({ description: 'Catégorie parente invalide' })
  create(
    @CurrentNotebook() access: NotebookAccess,
    @Body() body: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.create(access.notebookId, parseBody(createCategorySchema, body));
  }

  @Get(':categoryId')
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CategoryDto, description: 'Y compris masquée' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(
    @CurrentNotebook() access: NotebookAccess,
    @Param('categoryId') categoryId: string,
  ): Promise<CategoryDto> {
    return this.categories.get(access.notebookId, categoryId);
  }

  @Patch(':categoryId')
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CategoryDto })
  @ApiBadRequestResponse({ description: 'Corps vide ou invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiUnprocessableEntityResponse({ description: 'Catégorie parente invalide' })
  update(
    @CurrentNotebook() access: NotebookAccess,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.update(
      access.notebookId,
      categoryId,
      parseBody(updateCategorySchema, body),
    );
  }

  @Delete(':categoryId')
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Supprimée (logiquement), ou déjà supprimée' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'Catégorie du plan par défaut, ou avec sous-catégories' })
  async remove(
    @CurrentNotebook() access: NotebookAccess,
    @Param('categoryId') categoryId: string,
  ): Promise<void> {
    await this.categories.remove(access.notebookId, categoryId);
  }
}
