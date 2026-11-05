// Calendrier des échéances (F-REC-01, ADR-032) : chaque échéance se calcule depuis la date de
// départ (jamais par chaînage), avec repli en fin de mois.
import { describe, expect, it } from 'vitest';
import { dueDates, type Schedule } from '../../src/recurring/schedule.js';

const monthly = (startDate: string): Schedule => ({ frequency: 'monthly', startDate });

describe('dueDates', () => {
  it('mensuel le 31 : 30, 28 ou 29 (bissextile), puis retour au 31', () => {
    expect(dueDates(monthly('2027-12-31'), '2027-12-01', '2028-05-31')).toEqual([
      '2027-12-31',
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
      '2028-05-31',
    ]);
    expect(dueDates(monthly('2026-01-31'), '2026-02-01', '2026-03-31')).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('trimestriel depuis le 31 janvier : 30 avril, 31 juillet, 31 octobre, 31 janvier', () => {
    expect(
      dueDates({ frequency: 'quarterly', startDate: '2026-01-31' }, '2026-01-01', '2027-01-31'),
    ).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31', '2027-01-31']);
  });

  it('annuel le 29 février : 28 février hors années bissextiles', () => {
    expect(
      dueDates({ frequency: 'yearly', startDate: '2028-02-29' }, '2028-01-01', '2032-12-31'),
    ).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });

  it('hebdomadaire : même jour de semaine, à cheval sur deux mois', () => {
    expect(
      dueDates({ frequency: 'weekly', startDate: '2026-10-28' }, '2026-11-01', '2026-11-18'),
    ).toEqual(['2026-11-04', '2026-11-11', '2026-11-18']);
  });

  it('ponctuelle : une seule échéance, si elle est dans la fenêtre', () => {
    const once: Schedule = { frequency: 'once', startDate: '2026-12-24' };
    expect(dueDates(once, '2026-11-01', '2027-12-31')).toEqual(['2026-12-24']);
    expect(dueDates(once, '2026-12-25', '2027-12-31')).toEqual([]);
  });

  it('bornes incluses ; rien avant la date de départ ; fenêtre vide', () => {
    expect(dueDates(monthly('2026-03-15'), '2026-01-01', '2026-04-15')).toEqual([
      '2026-03-15',
      '2026-04-15',
    ]);
    expect(dueDates(monthly('2026-03-15'), '2026-04-16', '2026-04-15')).toEqual([]);
  });

  it('fenêtre éloignée du départ : saut direct, repli conservé', () => {
    expect(dueDates(monthly('2020-01-31'), '2026-02-01', '2026-03-31')).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(
      dueDates({ frequency: 'weekly', startDate: '2020-01-06' }, '2026-11-03', '2026-11-10'),
    ).toEqual(['2026-11-09']);
    expect(
      dueDates({ frequency: 'quarterly', startDate: '2001-08-31' }, '2026-09-01', '2026-12-31'),
    ).toEqual(['2026-11-30']);
  });

  it('`max` borne le nombre de dates rendues', () => {
    expect(
      dueDates({ frequency: 'weekly', startDate: '2026-01-05' }, '2026-01-01', '2026-12-31', 2),
    ).toEqual(['2026-01-05', '2026-01-12']);
  });
});
