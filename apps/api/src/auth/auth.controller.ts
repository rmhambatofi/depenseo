import { Body, Controller, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { parseBody } from '../http/parse-body.js';
import { Public } from './access-token.guard.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';
import { AuthService, LANGUAGES, registerSchema, verifyEmailSchema } from './auth.service.js';
import { loginSchema, refreshTokenSchema, SessionService } from './session.service.js';
import { ACCESS_TOKEN_TTL_S, REFRESH_TOKEN_TTL_S, type SessionTokens } from './session-tokens.js';

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

export class LoginDto {
  @ApiProperty({ format: 'email' })
  readonly email!: string;

  @ApiProperty()
  readonly password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Jeton de rafraîchissement (base64url, 43 caractères)' })
  readonly refreshToken!: string;
}

export class SessionTokensDto implements SessionTokens {
  @ApiProperty({ enum: ['Bearer'] })
  readonly tokenType!: 'Bearer';

  @ApiProperty({ description: 'JWT à présenter en `Authorization: Bearer …`' })
  readonly accessToken!: string;

  @ApiProperty({
    description: 'Durée de validité du jeton d’accès (s)',
    example: ACCESS_TOKEN_TTL_S,
  })
  readonly expiresIn!: number;

  @ApiProperty({ description: 'Jeton opaque à usage unique, à échanger sur /auth/refresh' })
  readonly refreshToken!: string;

  @ApiProperty({
    description: 'Durée de validité du jeton de rafraîchissement (s)',
    example: REFRESH_TOKEN_TTL_S,
  })
  readonly refreshExpiresIn!: number;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** Réponse 202 identique que l'adresse soit nouvelle ou déjà inscrite (F-AUTH-01, ADR-017). */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'Inscription prise en compte ; un e-mail de vérification suit',
  })
  @ApiBadRequestResponse({ description: 'Champs invalides' })
  async register(@Body() body: RegisterDto): Promise<void> {
    await this.auth.register(parseBody(registerSchema, body));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Adresse vérifiée' })
  @ApiBadRequestResponse({ description: 'Jeton invalide, expiré ou déjà utilisé' })
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<void> {
    const { token } = parseBody(verifyEmailSchema, body);
    await this.auth.verifyEmail(token);
  }

  /** Ouvre une session (F-AUTH-01) : 401 identifiants invalides, 403 adresse non vérifiée. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SessionTokensDto })
  @ApiBadRequestResponse({ description: 'Champs invalides' })
  @ApiUnauthorizedResponse({ description: 'Identifiants invalides' })
  @ApiForbiddenResponse({ description: 'Adresse e-mail non vérifiée' })
  async login(@Body() body: LoginDto): Promise<SessionTokensDto> {
    const { email, password } = parseBody(loginSchema, body);
    return this.sessions.login(email, password);
  }

  /** Rotation (NF-SEC-02) : le jeton présenté est consommé ; sa réutilisation révoque la session. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SessionTokensDto })
  @ApiBadRequestResponse({ description: 'Champs invalides' })
  @ApiUnauthorizedResponse({ description: 'Jeton inconnu, expiré, révoqué ou déjà utilisé' })
  async refresh(@Body() body: RefreshTokenDto): Promise<SessionTokensDto> {
    const { refreshToken } = parseBody(refreshTokenSchema, body);
    return this.sessions.refresh(refreshToken);
  }

  /** Ferme la session de cet appareil ; 204 même si le jeton est inconnu ou déjà révoqué. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Session fermée' })
  @ApiBadRequestResponse({ description: 'Champs invalides' })
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    const { refreshToken } = parseBody(refreshTokenSchema, body);
    await this.sessions.logout(refreshToken);
  }
}
