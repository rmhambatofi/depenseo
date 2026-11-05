// Routes d'abonnement du compte connecté (F-ABO-01/02/03, ADR-040) : droits, essai, vérification
// d'un achat (achat neuf ou restauration sur un autre appareil).
import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { parseBody } from '../http/parse-body.js';
import { type Plan, PLANS } from './entitlements.js';
import { type Store, STORES } from './store-receipt-verifier.js';
import {
  type EntitlementsView,
  SubscriptionsService,
  verifyRequestSchema,
} from './subscriptions.service.js';

class EntitlementsDto implements EntitlementsView {
  @ApiProperty({ enum: PLANS, description: '`trial` : essai de 14 jours en cours' })
  readonly plan!: Plan;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fin des droits Premium en cours (abonnement ou essai) ; null si gratuit',
  })
  readonly premiumUntil!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fin de l’essai (minuit local du 15e jour) ; null s’il n’a jamais commencé',
  })
  readonly trialEndsAt!: string | null;

  @ApiProperty({ description: 'Essai encore disponible (une fois par compte)' })
  readonly trialAvailable!: boolean;
}

/** Preuve d'achat : `transactionId` si `store = app_store`, `purchaseToken` si `google_play`. */
class VerifyPurchaseDto {
  @ApiProperty({
    enum: STORES,
    description:
      'Store de l’achat : exige `transactionId` (app_store) ou `purchaseToken` (google_play), ' +
      'à l’exclusion de l’autre champ',
  })
  readonly store!: Store;

  @ApiPropertyOptional({
    description: 'App Store : identifiant d’une transaction de l’abonnement (StoreKit 2)',
    maxLength: 64,
  })
  readonly transactionId?: string;

  @ApiPropertyOptional({ description: 'Google Play : jeton d’achat', maxLength: 2048 })
  readonly purchaseToken?: string;
}

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EntitlementsDto, description: 'Droits Premium du compte' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  get(@CurrentUser() principal: Principal): Promise<EntitlementsDto> {
    return this.subscriptions.entitlements(principal.userId);
  }

  @Post('trial')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EntitlementsDto, description: 'Essai commencé : droits mis à jour' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiConflictResponse({ description: 'Essai déjà utilisé par ce compte' })
  startTrial(@CurrentUser() principal: Principal): Promise<EntitlementsDto> {
    return this.subscriptions.startTrial(principal.userId);
  }

  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    type: EntitlementsDto,
    description: 'Achat vérifié auprès du store et rattaché au compte (ou restauré)',
  })
  @ApiBadRequestResponse({ description: 'Corps invalide, ou reçu refusé par le store' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiConflictResponse({ description: 'Achat déjà rattaché à un autre compte' })
  @ApiServiceUnavailableResponse({ description: 'Store non configuré ou injoignable' })
  verify(
    @CurrentUser() principal: Principal,
    @Body() body: VerifyPurchaseDto,
  ): Promise<EntitlementsDto> {
    return this.subscriptions.verify(principal.userId, parseBody(verifyRequestSchema, body));
  }
}
