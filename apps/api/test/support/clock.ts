import type { Clock } from '../../src/clock.js';

/** Horloge de test avancée à la main. */
export class FakeClock implements Clock {
  constructor(private epochMs: number = Date.UTC(2026, 10, 4, 9, 0, 0)) {}

  now(): Date {
    return new Date(this.epochMs);
  }

  set(epochMs: number): void {
    this.epochMs = epochMs;
  }

  advance(ms: number): void {
    this.epochMs += ms;
  }
}
