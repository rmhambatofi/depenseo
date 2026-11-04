import { Module } from '@nestjs/common';
import { NotebooksModule } from '../notebooks/notebooks.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [NotebooksModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
