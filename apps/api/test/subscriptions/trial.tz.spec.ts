// Fin d'essai (F-ABO-02, NF-FMT-05) : minuit local au début du 15e jour, jour du début = jour 1,
// dans les quatre fuseaux de référence et à travers les changements d'heure.
import { describe, expect, it } from 'vitest';
import { trialEnd } from '../../src/subscriptions/entitlements.js';

const at = (iso: string) => new Date(iso);

describe('trialEnd (multi-fuseaux)', () => {
  it.each([
    // Paris : début 20 mars 2026 (UTC+1), fin 3 avril 00:00 en heure d'été (UTC+2).
    ['Europe/Paris', '2026-03-20T12:00:00Z', '2026-04-02T22:00:00.000Z'],
    // Paris : début 31 octobre 2026 23:30 UTC = 1er novembre 00:30 local (jour 1 = 1er novembre).
    ['Europe/Paris', '2026-10-31T23:30:00Z', '2026-11-14T23:00:00.000Z'],
    // Lisbonne : début 20 octobre 2026 (UTC+1), fin 3 novembre 00:00 en heure d'hiver (UTC+0).
    ['Europe/Lisbon', '2026-10-20T08:00:00Z', '2026-11-03T00:00:00.000Z'],
    // Montréal : début 28 février 2026 (UTC-5), fin 14 mars 00:00 en heure d'été (UTC-4).
    ['America/Montreal', '2026-02-28T15:00:00Z', '2026-03-14T04:00:00.000Z'],
    // Montréal : 1er mars 2026 03:00 UTC = 28 février 22:00 local (jour 1 = 28 février).
    ['America/Montreal', '2026-03-01T03:00:00Z', '2026-03-14T04:00:00.000Z'],
    // La Réunion (UTC+4, sans heure d'été) : 1er mai 21:00 UTC = 2 mai 01:00 local.
    ['Indian/Reunion', '2026-05-01T21:00:00Z', '2026-05-15T20:00:00.000Z'],
  ])('%s, début %s → fin %s', (zone, start, end) => {
    expect(trialEnd(at(start), zone).toISOString()).toBe(end);
  });

  it('le jour 14 est couvert jusqu’à sa dernière milliseconde locale', () => {
    // Paris, début 2 août 2027 : jour 14 = 15 août, jour 15 = 16 août.
    const end = trialEnd(at('2027-08-02T08:00:00Z'), 'Europe/Paris');
    expect(end.toISOString()).toBe('2027-08-15T22:00:00.000Z');
    expect(new Date(end.getTime() - 1).toISOString()).toBe('2027-08-15T21:59:59.999Z');
  });
});
