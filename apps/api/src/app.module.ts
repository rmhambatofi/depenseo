import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import type { IdTokenKeys } from './auth/id-token-verifier.js';
import { type Clock, systemClock } from './clock.js';
import { ClockModule } from './clock.module.js';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { MeModule } from './me/me.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { LimitsModule } from './limits/limits.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { RecurringModule } from './recurring/recurring.module.js';
import { NotebooksModule } from './notebooks/notebooks.module.js';
import { SyncModule } from './sync/sync.module.js';
import { ExportsModule } from './exports/exports.module.js';
import { AccountExportModule } from './account-export/account-export.module.js';
import { pinoHttpOptions } from './logging/pino-options.js';
import type { StoreReceiptVerifier } from './subscriptions/store-receipt-verifier.js';
import type { StoreNotificationKeys } from './subscriptions/store-notifications.service.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';

@Module({})
export class AppModule {
  static register(
    config: AppConfig,
    {
      logDestination,
      clock = systemClock,
      idTokenKeys,
      storeVerifier,
      storeNotificationKeys,
    }: {
      logDestination?: DestinationStream;
      clock?: Clock;
      idTokenKeys?: IdTokenKeys;
      storeVerifier?: StoreReceiptVerifier;
      storeNotificationKeys?: StoreNotificationKeys;
    } = {},
  ): DynamicModule {
    const options = pinoHttpOptions(config);
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: logDestination ? [options, logDestination] : options,
        }),
        ConfigModule.register(config),
        DatabaseModule.register(config),
        ClockModule.register(clock),
        AuthModule.register(idTokenKeys),
        MeModule,
        AccountExportModule,
        NotificationsModule,
        NotebooksModule,
        CategoriesModule,
        ExpensesModule,
        LimitsModule,
        DashboardModule,
        RecurringModule,
        SyncModule,
        ExportsModule,
        SubscriptionsModule.register(storeVerifier, storeNotificationKeys),
        AdminModule,
      ],
      controllers: [HealthController],
    };
  }
}
