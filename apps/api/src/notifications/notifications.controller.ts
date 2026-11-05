// Routes de compte des notifications push (F-NOT-01, F-NOT-04, ADR-035) : enregistrement des
// appareils et réglages par type avec plage de silence. Données du seul compte connecté.
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../auth/access-token.guard.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { PUSH_PLATFORMS, PUSH_TOKEN_MAX_LENGTH, type PushPlatform } from '../db/schema/index.js';
import { ProblemException } from '../errors/problem.exception.js';
import { parseBody } from '../http/parse-body.js';
import { uuidV7 } from '../http/uuid-schemas.js';
import { deviceInputSchema, registerDevice, unregisterDevice } from './devices.js';
import {
  loadNotificationSettings,
  type NotificationSettings,
  notificationSettingsPatchSchema,
  updateNotificationSettings,
} from './notification-settings.js';
import { LOCAL_TIME_PATTERN } from './reminder-time.js';

const UNAUTHORIZED = 'Jeton d’accès absent, invalide ou expiré';
const TIME = { pattern: LOCAL_TIME_PATTERN, example: '22:00' } as const;

export class DeviceDto {
  @ApiProperty({ enum: PUSH_PLATFORMS })
  readonly platform!: PushPlatform;

  @ApiProperty({
    maxLength: PUSH_TOKEN_MAX_LENGTH,
    description: 'Jeton APNs (iOS) ou FCM (Android)',
  })
  readonly token!: string;
}

export class QuietHoursDto {
  @ApiProperty({ ...TIME, description: 'Début, heure locale (inclus)' })
  readonly start!: string;

  @ApiProperty({ ...TIME, example: '07:00', description: 'Fin, heure locale (exclue)' })
  readonly end!: string;
}

export class NotificationSettingsDto {
  @ApiProperty({ description: 'Alertes de limite (80 %, 100 %…)' })
  readonly limit!: boolean;

  @ApiProperty({ description: 'Échéances récurrentes : à confirmer, rappels J-3 et jour J' })
  readonly occurrence!: boolean;

  @ApiProperty({ description: 'Dépense inhabituellement élevée' })
  readonly unusualExpense!: boolean;

  @ApiProperty({ description: 'Rappel quotidien de saisie (heure : `dailyReminderTime` de /me)' })
  readonly dailyReminder!: boolean;

  @ApiProperty({
    type: QuietHoursDto,
    nullable: true,
    description: 'Plage de silence (fuseau du compte) ; notifications reportées à sa fin',
  })
  readonly quietHours!: QuietHoursDto | null;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional()
  readonly limit?: boolean;

  @ApiPropertyOptional()
  readonly occurrence?: boolean;

  @ApiPropertyOptional()
  readonly unusualExpense?: boolean;

  @ApiPropertyOptional()
  readonly dailyReminder?: boolean;

  @ApiPropertyOptional({ type: QuietHoursDto, nullable: true, description: 'null = aucune plage' })
  readonly quietHours?: QuietHoursDto | null;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me')
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Put('devices/:deviceId')
  @ApiParam({ name: 'deviceId', format: 'uuid', description: 'UUID v7 tiré par l’application' })
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Appareil enregistré ou mis à jour' })
  @ApiBadRequestResponse({ description: 'Identifiant, plateforme ou jeton invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé par un autre compte' })
  async register(
    @CurrentUser() principal: Principal,
    @Param('deviceId') deviceId: string,
    @Body() body: DeviceDto,
  ): Promise<void> {
    if (!uuidV7.safeParse(deviceId).success) {
      throw new ProblemException(400, 'Identifiant d’appareil invalide (UUID v7 attendu)');
    }
    const input = parseBody(deviceInputSchema, body);
    await registerDevice(this.db, principal.userId, deviceId, input, this.clock.now());
  }

  @Delete('devices/:deviceId')
  @ApiParam({ name: 'deviceId', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Appareil désinscrit, ou inconnu' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  async unregister(
    @CurrentUser() principal: Principal,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    if (uuidV7.safeParse(deviceId).success) {
      await unregisterDevice(this.db, principal.userId, deviceId);
    }
  }

  @Get('notification-settings')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotificationSettingsDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  getSettings(@CurrentUser() principal: Principal): Promise<NotificationSettings> {
    return loadNotificationSettings(this.db, principal.userId);
  }

  @Patch('notification-settings')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotificationSettingsDto, description: 'Réglages après modification' })
  @ApiBadRequestResponse({ description: 'Corps vide, champ inconnu ou heure invalide' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  updateSettings(
    @CurrentUser() principal: Principal,
    @Body() body: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    const patch = parseBody(notificationSettingsPatchSchema, body);
    return updateNotificationSettings(this.db, principal.userId, patch, this.clock.now());
  }
}
