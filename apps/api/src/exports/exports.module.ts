import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.token.js';
import type { AppConfig } from '../config/env.js';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';
import { createFileStore } from './file-store.js';
import { FILE_STORE } from './file-store.token.js';

@Module({
  imports: [NotebooksModule],
  controllers: [ExportsController],
  providers: [
    ExportsService,
    {
      provide: FILE_STORE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createFileStore(config) ?? null,
    },
  ],
  exports: [FILE_STORE],
})
export class ExportsModule {}
