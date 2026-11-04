import { Module } from '@nestjs/common';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

@Module({
  imports: [NotebooksModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
