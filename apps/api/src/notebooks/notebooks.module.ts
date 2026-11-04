import { Module } from '@nestjs/common';
import { NotebookAccessGuard } from './notebook-access.guard.js';
import { NotebooksController } from './notebooks.controller.js';

@Module({
  controllers: [NotebooksController],
  providers: [NotebookAccessGuard],
  exports: [NotebookAccessGuard],
})
export class NotebooksModule {}
