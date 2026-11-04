// Fabrique de l'application : partagée par main.ts, les tests et la génération OpenAPI.
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/env.js';
import { ProblemDetailsFilter } from './errors/problem-details.filter.js';

export const API_PREFIX = 'api/v1';

export interface CreateAppOptions {
  /** Flux de journal (tests) ; sortie standard par défaut. */
  logDestination?: DestinationStream;
}

export async function createApp(
  config: AppConfig,
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  // Pas de CORS : web, back-office et API partagent le même domaine (§8.4).
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config, options.logDestination),
    { bufferLogs: true, cors: false },
  );
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
