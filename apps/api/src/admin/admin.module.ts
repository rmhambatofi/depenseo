import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import { AdminGuard } from './admin.guard.js';
import { ADMIN_CONSOLE, loadAdminConsole } from './admin-console.js';
import { AdminConsoleController } from './admin-console.controller.js';
import { AdminLoginService } from './admin-login.service.js';
import { AdminOpsService } from './admin-ops.service.js';
import {
  AdminAuditController,
  AdminJobsController,
  AdminStatsController,
  AdminSubscriptionsController,
  AdminUsersController,
} from './admin-routes.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminSessionController } from './admin-session.controller.js';
import { ADMIN_SETTINGS, adminSettings } from './admin-settings.js';

@Module({
  controllers: [
    AdminSessionController,
    AdminUsersController,
    AdminSubscriptionsController,
    AdminJobsController,
    AdminStatsController,
    AdminAuditController,
    AdminConsoleController,
  ],
  providers: [
    AdminGuard,
    AdminLoginService,
    AdminUsersService,
    AdminOpsService,
    {
      provide: ADMIN_SETTINGS,
      useFactory: (config: AppConfig) => adminSettings(config),
      inject: [APP_CONFIG],
    },
    {
      provide: ADMIN_CONSOLE,
      useFactory: (config: AppConfig) =>
        config.ADMIN_DIST_DIR ? loadAdminConsole(config.ADMIN_DIST_DIR) : null,
      inject: [APP_CONFIG],
    },
  ],
})
export class AdminModule {}
