// Profil du compte connecté (§8.3, NF-FMT-04, ADR-022) : lecture, et modification des préférences
// (langue, fuseau IANA, devise). Les dates de consentement sont en lecture seule.
import { SUPPORTED_CURRENCIES, TIME_ZONE_MAX_LENGTH } from '@depenseo/shared';
import { Body, Controller, Get, Header, Inject, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { LANGUAGES } from '../auth/auth.service.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { user } from '../db/schema/index.js';
import { ProblemException } from '../errors/problem.exception.js';
import { parseBody } from '../http/parse-body.js';
import { profilePatchSchema } from './profile.js';

type Language = (typeof LANGUAGES)[number];

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'email' })
  readonly email!: string;

  @ApiProperty({ enum: LANGUAGES })
  readonly language!: Language;

  @ApiProperty({ description: 'Fuseau IANA, ex. Europe/Paris', example: 'Europe/Paris' })
  readonly timeZone!: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCIES, description: 'Code ISO 4217' })
  readonly currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Acceptation des CGU (UTC)',
  })
  readonly termsAcceptedAt!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Acceptation de la politique de confidentialité (UTC)',
  })
  readonly privacyAcceptedAt!: string | null;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ enum: LANGUAGES })
  readonly language?: Language;

  @ApiPropertyOptional({
    maxLength: TIME_ZONE_MAX_LENGTH,
    description: 'Fuseau IANA (`Zone/Lieu` ou `UTC`) ; décalages fixes et abréviations refusés',
    example: 'America/Montreal',
  })
  readonly timeZone?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, description: 'Code ISO 4217' })
  readonly currency?: string;
}

const profileColumns = {
  id: user.id,
  email: user.email,
  language: user.language,
  timeZone: user.timeZone,
  currency: user.currency,
  termsAcceptedAt: user.termsAcceptedAt,
  privacyAcceptedAt: user.privacyAcceptedAt,
};

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Jeton d’accès absent, invalide ou expiré' })
  async get(@CurrentUser() principal: Principal): Promise<MeDto> {
    return this.load(principal.userId);
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MeDto, description: 'Profil après modification' })
  @ApiBadRequestResponse({
    description: 'Corps vide, champ inconnu, langue, fuseau ou devise non pris en charge',
  })
  @ApiUnauthorizedResponse({ description: 'Jeton d’accès absent, invalide ou expiré' })
  async update(@CurrentUser() principal: Principal, @Body() body: UpdateMeDto): Promise<MeDto> {
    const patch = parseBody(profilePatchSchema, body);
    await this.db
      .update(user)
      .set({ ...patch, updatedAt: this.clock.now() })
      .where(eq(user.id, principal.userId));
    return this.load(principal.userId);
  }

  private async load(userId: string): Promise<MeDto> {
    const [account] = await this.db.select(profileColumns).from(user).where(eq(user.id, userId));
    // Compte supprimé pendant la validité du jeton d'accès (15 min au plus).
    if (!account) throw new ProblemException(401, 'Authentification requise');
    return {
      ...account,
      // Seules les écritures validées par `profilePatchSchema` ou l'inscription touchent la colonne.
      language: account.language as Language,
      termsAcceptedAt: account.termsAcceptedAt?.toISOString() ?? null,
      privacyAcceptedAt: account.privacyAcceptedAt?.toISOString() ?? null,
    };
  }
}
