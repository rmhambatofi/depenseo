import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [NotebooksModule, ExpensesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
