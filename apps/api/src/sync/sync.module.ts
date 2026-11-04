import { Module } from '@nestjs/common';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [NotebooksModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
