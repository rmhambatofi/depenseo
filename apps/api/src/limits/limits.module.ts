import { Module } from '@nestjs/common';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { LimitsController } from './limits.controller.js';
import { LimitsService } from './limits.service.js';
import { PeriodSummaryService } from './period-summary.service.js';

@Module({
  imports: [NotebooksModule],
  controllers: [LimitsController],
  providers: [LimitsService, PeriodSummaryService],
})
export class LimitsModule {}
