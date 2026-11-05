import { Module } from '@nestjs/common';
import { ExportsModule } from '../exports/exports.module.js';
import { MeController } from './me.controller.js';

@Module({ imports: [ExportsModule], controllers: [MeController] })
export class MeModule {}
