import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { APP_CONFIG } from './config/config.token.js';
import type { AppConfig } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { pinoHttpOptions } from './logging/pino-options.js';

@Module({})
export class AppModule {
  static register(config: AppConfig, logDestination?: DestinationStream): DynamicModule {
    const options = pinoHttpOptions(config);
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: logDestination ? [options, logDestination] : options,
        }),
        DatabaseModule.register(config),
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
