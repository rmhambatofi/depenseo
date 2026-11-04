import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { parseBody } from '../http/parse-body.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';
import { AuthService, LANGUAGES, registerSchema, verifyEmailSchema } from './auth.service.js';

export class RegisterDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  readonly email!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  readonly password!: string;

  @ApiProperty({
    enum: [true],
    description: 'Acceptation des CGU et de la politique de confidentialité',
  })
  readonly acceptTerms!: true;

  @ApiPropertyOptional({ enum: LANGUAGES, default: 'fr' })
  readonly language?: (typeof LANGUAGES)[number];
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Jeton reçu par e-mail (base64url, 43 caractères)' })
  readonly token!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Réponse 202 identique que l'adresse soit nouvelle ou déjà inscrite (F-AUTH-01, ADR-017). */
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'Inscription prise en compte ; un e-mail de vérification suit',
  })
  @ApiBadRequestResponse({ description: 'Champs invalides' })
  async register(@Body() body: RegisterDto): Promise<void> {
    await this.auth.register(parseBody(registerSchema, body));
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Adresse vérifiée' })
  @ApiBadRequestResponse({ description: 'Jeton invalide, expiré ou déjà utilisé' })
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<void> {
    const { token } = parseBody(verifyEmailSchema, body);
    await this.auth.verifyEmail(token);
  }
}
