import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import { AdminGuard } from './admin.guard.js';
import { AdminLoginService } from './admin-login.service.js';
import { AdminSessionController } from './admin-session.controller.js';
import { ADMIN_SETTINGS, adminSettings } from './admin-settings.js';

@Module({
  controllers: [AdminSessionController],
  providers: [
    AdminGuard,
    AdminLoginService,
    {
      provide: ADMIN_SETTINGS,
      useFactory: (config: AppConfig) => adminSettings(config),
      inject: [APP_CONFIG],
    },
  ],
})
export class AdminModule {}
