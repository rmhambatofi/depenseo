import { type DynamicModule, Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../clock.js';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import { createStoreVerifier } from './store-config.js';
import {
  notificationSettings,
  STORE_NOTIFICATION_SETTINGS,
  type StoreNotificationKeys,
  StoreNotificationsService,
} from './store-notifications.service.js';
import { StoreNotificationsController } from './store-notifications.controller.js';
import { STORE_RECEIPT_VERIFIER, type StoreReceiptVerifier } from './store-receipt-verifier.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Module({})
export class SubscriptionsModule {
  /**
   * `storeVerifier` remplace les API des stores, `notificationKeys` les clés de confiance des
   * notifications (tests).
   */
  static register(
    storeVerifier?: StoreReceiptVerifier,
    notificationKeys?: StoreNotificationKeys,
  ): DynamicModule {
    return {
      module: SubscriptionsModule,
      controllers: [SubscriptionsController, StoreNotificationsController],
      providers: [
        SubscriptionsService,
        StoreNotificationsService,
        {
          provide: STORE_NOTIFICATION_SETTINGS,
          useFactory: (config: AppConfig, clock: Clock) =>
            notificationSettings(config, clock, notificationKeys),
          inject: [APP_CONFIG, CLOCK],
        },
        storeVerifier
          ? { provide: STORE_RECEIPT_VERIFIER, useValue: storeVerifier }
          : {
              provide: STORE_RECEIPT_VERIFIER,
              useFactory: (config: AppConfig, clock: Clock) =>
                createStoreVerifier(config, clock, notificationKeys?.appleRoots),
              inject: [APP_CONFIG, CLOCK],
            },
      ],
    };
  }
}
