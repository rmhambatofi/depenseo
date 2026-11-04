// Profil du compte connecté (§8.3). Minimal en P1-06 (sert de route protégée de référence) ;
// préférences et PATCH en P1-10.
import { Controller, Get, Header, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { user } from '../db/schema/index.js';
import { ProblemException } from '../errors/problem.exception.js';

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'email' })
  readonly email!: string;
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Jeton d’accès absent, invalide ou expiré' })
  async get(@CurrentUser() principal: Principal): Promise<MeDto> {
    const [account] = await this.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, principal.userId));
    // Compte supprimé pendant la validité du jeton d'accès (15 min au plus).
    if (!account) throw new ProblemException(401, 'Authentification requise');
    return account;
  }
}
