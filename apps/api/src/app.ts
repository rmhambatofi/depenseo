// Fabrique de l'application : partagée par main.ts, les tests et la génération OpenAPI.
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module.js';
import type { IdTokenKeys } from './auth/id-token-verifier.js';
import type { Clock } from './clock.js';
import type { AppConfig } from './config/env.js';
import type { StoreNotificationKeys } from './subscriptions/store-notifications.service.js';
import type { StoreReceiptVerifier } from './subscriptions/store-receipt-verifier.js';
import { ProblemDetailsFilter } from './errors/problem-details.filter.js';

export const API_PREFIX = 'api/v1';

export interface CreateAppOptions {
  /** Flux de journal (tests) ; sortie standard par défaut. */
  logDestination?: DestinationStream;
  /** Horloge applicative (tests) ; horloge système par défaut. */
  clock?: Clock;
  /** Clés de signature Apple/Google (tests) ; JWKS distants des fournisseurs par défaut. */
  idTokenKeys?: IdTokenKeys;
  /** Vérification des achats (tests) ; App Store Server API et Google Play par défaut. */
  storeVerifier?: StoreReceiptVerifier;
  /** Racines Apple et clés Google des notifications des stores (tests) ; celles des stores sinon. */
  storeNotificationKeys?: StoreNotificationKeys;
}

export async function createApp(
  config: AppConfig,
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  // Pas de CORS : web, back-office et API partagent le même domaine (§8.4).
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config, options),
    { bufferLogs: true, cors: false },
  );
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  // Le back-office et son API vivent sous /admin (cookie `Path=/admin`, §8.5, ADR-042).
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: 'admin{/*rest}', method: RequestMethod.ALL }],
  });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
