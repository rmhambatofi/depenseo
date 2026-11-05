import { type DynamicModule, Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../clock.js';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import { createStoreVerifier } from './store-config.js';
import { STORE_RECEIPT_VERIFIER, type StoreReceiptVerifier } from './store-receipt-verifier.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Module({})
export class SubscriptionsModule {
  /** `storeVerifier` remplace les API des stores (tests). */
  static register(storeVerifier?: StoreReceiptVerifier): DynamicModule {
    return {
      module: SubscriptionsModule,
      controllers: [SubscriptionsController],
      providers: [
        SubscriptionsService,
        storeVerifier
          ? { provide: STORE_RECEIPT_VERIFIER, useValue: storeVerifier }
          : {
              provide: STORE_RECEIPT_VERIFIER,
              useFactory: (config: AppConfig, clock: Clock) => createStoreVerifier(config, clock),
              inject: [APP_CONFIG, CLOCK],
            },
      ],
    };
  }
}
