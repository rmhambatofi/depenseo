// Plage de silence (F-NOT-04, ADR-035) : heures locales du compte, fin exclue, plage à cheval sur
// minuit permise ; une notification tombant dans la plage part à sa fin. Fuseaux NF-FMT-05 et
// changements d'heure.
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { quietHoursEnd } from '../../src/notifications/quiet-hours.js';

const at = (iso: string) => Temporal.Instant.from(iso);
const end = (iso: string, tz: string, start: string, stop: string) =>
  quietHoursEnd(at(iso), tz, { start, end: stop })?.toString() ?? null;

describe('quietHoursEnd', () => {
  it.each([
    // 23:00 locales le 10 février 2025 → fin à 07:00 locales le 11.
    ['Europe/Paris', '2025-02-10T22:00:00Z', '2025-02-11T06:00:00Z'],
    ['Europe/Lisbon', '2025-02-10T23:00:00Z', '2025-02-11T07:00:00Z'],
    ['America/Montreal', '2025-02-11T04:00:00Z', '2025-02-11T12:00:00Z'],
    ['Indian/Reunion', '2025-02-10T19:00:00Z', '2025-02-11T03:00:00Z'],
  ])('%s : 23:00 locales dans 22:00–07:00 → 07:00 le lendemain', (tz, now, expected) => {
    expect(end(now, tz, '22:00', '07:00')).toBe(expected);
  });

  it.each([
    // 03:00 locales : fin le jour même.
    ['Europe/Paris', '2025-02-11T02:00:00Z', '2025-02-11T06:00:00Z'],
    ['America/Montreal', '2025-02-11T08:00:00Z', '2025-02-11T12:00:00Z'],
  ])('%s : 03:00 locales → 07:00 le jour même', (tz, now, expected) => {
    expect(end(now, tz, '22:00', '07:00')).toBe(expected);
  });

  it.each([
    ['Europe/Paris', '2025-02-10T20:59:00Z'], // 21:59 locales
    ['Europe/Paris', '2025-02-11T06:00:00Z'], // 07:00 pile : fin exclue
    ['Indian/Reunion', '2025-02-10T08:00:00Z'], // 12:00 locales
  ])('%s %s : hors plage → null', (tz, now) => {
    expect(end(now, tz, '22:00', '07:00')).toBeNull();
  });

  it('22:00 pile : dans la plage (début inclus)', () => {
    expect(end('2025-02-10T21:00:00Z', 'Europe/Paris', '22:00', '07:00')).toBe(
      '2025-02-11T06:00:00Z',
    );
  });

  it('plage dans la journée (12:00–14:00)', () => {
    expect(end('2025-02-10T12:30:00Z', 'Europe/Paris', '12:00', '14:00')).toBe(
      '2025-02-10T13:00:00Z',
    );
    expect(end('2025-02-10T13:00:00Z', 'Europe/Paris', '12:00', '14:00')).toBeNull();
  });

  it('nuit du passage à l’heure d’été (Paris, 30 mars 2025) : fin à 07:00 heure d’été', () => {
    // 23:00 le 29 (UTC+1) → 07:00 le 30 = 05:00 UTC.
    expect(end('2025-03-29T22:00:00Z', 'Europe/Paris', '22:00', '07:00')).toBe(
      '2025-03-30T05:00:00Z',
    );
  });

  it('nuit du retour à l’heure d’hiver (Lisbonne, 27 octobre 2024)', () => {
    // 01:30 locales (première occurrence, UTC+1) → 07:00 UTC+0.
    expect(end('2024-10-27T00:30:00Z', 'Europe/Lisbon', '22:00', '07:00')).toBe(
      '2024-10-27T07:00:00Z',
    );
  });

  it('fin à une heure inexistante (Montréal, 9 mars 2025, 02:30) → 03:30 heure d’été', () => {
    expect(end('2025-03-09T06:00:00Z', 'America/Montreal', '00:00', '02:30')).toBe(
      '2025-03-09T07:30:00Z',
    );
  });

  it('pas de plage → null', () => {
    expect(quietHoursEnd(at('2025-02-10T22:00:00Z'), 'Europe/Paris', null)).toBeNull();
  });
});
