// Points d'entrée des notifications serveur des stores (F-ABO-01, ADR-041) : publics au sens de la
// garde d'accès (appelés par Apple et Google, pas par un utilisateur), authentifiés par la signature
// Apple ou le jeton OIDC du push Pub/Sub. Gardés dans le contrat OpenAPI pour que le test de liste
// blanche des routes publiques les voie (aucun client Depenseo ne les appelle).
import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/access-token.guard.js';
import { StoreNotificationsService } from './store-notifications.service.js';

const OK = 'Notification reçue (ignorée si elle ne concerne aucun abonnement connu)';
const UNAVAILABLE = 'Store non configuré ou injoignable : le store relivrera la notification';

@ApiTags('store-notifications')
@Controller('store-notifications')
export class StoreNotificationsController {
  constructor(private readonly notifications: StoreNotificationsService) {}

  /** App Store Server Notifications v2 ; 200 = reçue (Apple relivre sinon). */
  @Public()
  @Post('app-store')
  @HttpCode(200)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['signedPayload'],
      properties: { signedPayload: { type: 'string', description: 'JWS signé par Apple (x5c)' } },
    },
  })
  @ApiOkResponse({ description: OK })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: 'Signature absente de la chaîne Apple' })
  @ApiServiceUnavailableResponse({ description: UNAVAILABLE })
  appStore(@Body() body: unknown): Promise<void> {
    return this.notifications.appStore(body);
  }

  /** Google Play RTDN par push Pub/Sub ; 200 = acquittement. */
  @Public()
  @Post('google-play')
  @HttpCode(200)
  @ApiBody({
    description: 'Message push Pub/Sub ; `message.data` = DeveloperNotification en base64',
    schema: {
      type: 'object',
      required: ['message', 'subscription'],
      properties: {
        message: {
          type: 'object',
          required: ['data'],
          properties: { data: { type: 'string', format: 'byte' } },
        },
        subscription: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: OK })
  @ApiBadRequestResponse({ description: 'Corps ou message invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton OIDC du push absent ou refusé' })
  @ApiServiceUnavailableResponse({ description: UNAVAILABLE })
  googlePlay(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    return this.notifications.googlePlay(authorization, body);
  }
}
