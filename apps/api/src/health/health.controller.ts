import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/access-token.guard.js';

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  readonly status!: 'ok';
}

/** Sonde appelée chaque minute par cron pour garder Passenger éveillé (§8.5). */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOkResponse({ type: HealthDto })
  get(): HealthDto {
    return { status: 'ok' };
  }
}
