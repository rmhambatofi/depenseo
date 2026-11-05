import { Module } from '@nestjs/common';
import { ExportsModule } from '../exports/exports.module.js';
import { AccountExportController } from './account-export.controller.js';
import { AccountExportService } from './account-export.service.js';

@Module({
  imports: [ExportsModule],
  controllers: [AccountExportController],
  providers: [AccountExportService],
})
export class AccountExportModule {}
