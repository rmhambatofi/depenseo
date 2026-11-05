import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CLOCK, type Clock } from '../clock.js';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  ID_TOKEN_VERIFIER,
  type IdTokenKeys,
  JoseIdTokenVerifier,
  providerSettings,
} from './id-token-verifier.js';
import { PasswordResetService } from './password-reset.service.js';
import { SessionService } from './session.service.js';
import { SocialLoginService } from './social-login.service.js';

@Module({})
export class AuthModule {
  /** `idTokenKeys` remplace les JWKS distants d'Apple et Google (tests). */
  static register(idTokenKeys: IdTokenKeys = {}): DynamicModule {
    return {
      module: AuthModule,
      // Global : le back-office (AdminModule) réutilise `AuthService.authenticate`.
      global: true,
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionService,
        PasswordResetService,
        SocialLoginService,
        {
          provide: ID_TOKEN_VERIFIER,
          useFactory: (config: AppConfig, clock: Clock) =>
            new JoseIdTokenVerifier(providerSettings(config, idTokenKeys), clock),
          inject: [APP_CONFIG, CLOCK],
        },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
      exports: [AuthService, SessionService],
    };
  }
}
