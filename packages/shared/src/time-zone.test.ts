import { describe, expect, it } from 'vitest';
import { normalizeTimeZone, TIME_ZONE_MAX_LENGTH } from './time-zone.js';

describe('normalizeTimeZone (NF-FMT-04, ADR-022)', () => {
  it.each([
    ['Europe/Paris', 'Europe/Paris'],
    ['europe/paris', 'Europe/Paris'],
    ['UTC', 'UTC'],
    ['utc', 'UTC'],
    ['Indian/Reunion', 'Indian/Reunion'],
    // Alias conservés (ICU les remplacerait : America/Toronto, America/Buenos_Aires…).
    ['America/Montreal', 'America/Montreal'],
    ['america/montreal', 'America/Montreal'],
    ['America/Argentina/Buenos_Aires', 'America/Argentina/Buenos_Aires'],
    ['us/eastern', 'US/Eastern'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTimeZone(input)).toBe(expected);
  });

  it.each([
    ['inconnu', 'Mars/Olympus_Mons'],
    ['décalage fixe', '+01:00'],
    ['décalage fixe Etc', 'Etc/GMT+4'],
    ['décalage fixe Etc minuscules', 'etc/gmt-2'],
    ['abréviation', 'CET'],
    ['abréviation EST', 'EST'],
    ['vide', ''],
    ['espaces', ' Europe/Paris'],
    ['trop long', `Europe/${'a'.repeat(TIME_ZONE_MAX_LENGTH)}`],
  ])('refuse %s', (_label, input) => {
    expect(normalizeTimeZone(input)).toBeUndefined();
  });
});
