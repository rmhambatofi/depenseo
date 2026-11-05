import { Module } from '@nestjs/common';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { OccurrencesService } from './occurrences.service.js';
import { OccurrencesController, RecurringController } from './recurring.controller.js';
import { RecurringService } from './recurring.service.js';

@Module({
  imports: [NotebooksModule],
  controllers: [RecurringController, OccurrencesController],
  providers: [RecurringService, OccurrencesService],
})
export class RecurringModule {}
