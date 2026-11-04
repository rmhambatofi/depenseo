import { Module } from '@nestjs/common';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { LimitsController } from './limits.controller.js';
import { LimitsService } from './limits.service.js';

@Module({
  imports: [NotebooksModule],
  controllers: [LimitsController],
  providers: [LimitsService],
})
export class LimitsModule {}
