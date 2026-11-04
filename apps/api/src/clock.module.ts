// Horloge applicative injectable partout (`@Inject(CLOCK)`) ; les tests passent une FakeClock.
import { type DynamicModule, Module } from '@nestjs/common';
import { CLOCK, type Clock } from './clock.js';

@Module({})
export class ClockModule {
  static register(clock: Clock): DynamicModule {
    return {
      module: ClockModule,
      global: true,
      providers: [{ provide: CLOCK, useValue: clock }],
      exports: [CLOCK],
    };
  }
}
