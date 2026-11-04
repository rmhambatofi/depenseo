// Fournit le pool et le client Drizzle ; le pool se connecte à la première requête et se ferme à l'arrêt.
import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'mysql2';
import type { AppConfig } from '../config/env.js';
import { createDatabase, createDbPool } from './connection.js';

export const DB_POOL = Symbol('DB_POOL');
export const DB = Symbol('DB');

@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  static register(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: DB_POOL, useFactory: () => createDbPool(config) },
        { provide: DB, useFactory: (pool: Pool) => createDatabase(pool), inject: [DB_POOL] },
      ],
      exports: [DB_POOL, DB],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.promise().end();
  }
}
