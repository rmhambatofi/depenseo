// Configuration validée (`loadConfig`) injectable partout : `@Inject(APP_CONFIG)`.
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG } from './config.token.js';
import type { AppConfig } from './env.js';

@Module({})
export class ConfigModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
