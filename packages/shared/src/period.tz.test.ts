import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { asCalendarDate } from './calendar-date.js';
import {
  nextPeriod,
  periodContaining,
  previousPeriod,
  todayIn,
  toCalendarDate,
  toPlainDate,
  type Period,
  type PeriodRule,
} from './period.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const fmt = (p: Period) => `${p.start.toString()}..${p.end.toString()}`;
const at = (iso: string) => Temporal.Instant.from(iso);

const ZONES = ['Europe/Paris', 'Europe/Lisbon', 'America/Montreal', 'Indian/Reunion'] as const;

describe('periodContaining — mois', () => {
  const month = (startDay: number): PeriodRule => ({ kind: 'month', startDay });

  it('jour de début 1 = mois civil', () => {
    expect(fmt(periodContaining(d('2026-02-14'), month(1)))).toBe('2026-02-01..2026-02-28');
    expect(fmt(periodContaining(d('2024-02-29'), month(1)))).toBe('2024-02-01..2024-02-29');
    expect(fmt(periodContaining(d('2026-12-31'), month(1)))).toBe('2026-12-01..2026-12-31');
  });

  it('jour de paie 28 : du 28 au 27 du mois suivant, à cheval sur l’année', () => {
    expect(fmt(periodContaining(d('2026-11-28'), month(28)))).toBe('2026-11-28..2026-12-27');
    expect(fmt(periodContaining(d('2026-11-27'), month(28)))).toBe('2026-10-28..2026-11-27');
    expect(fmt(periodContaining(d('2027-01-03'), month(28)))).toBe('2026-12-28..2027-01-27');
  });

  it('repli sur la fin de mois quand le jour de début n’existe pas (ADR-012)', () => {
    // 31 → 28 février (année non bissextile), 30 avril
    expect(fmt(periodContaining(d('2026-02-10'), month(31)))).toBe('2026-01-31..2026-02-27');
    expect(fmt(periodContaining(d('2026-02-28'), month(31)))).toBe('2026-02-28..2026-03-30');
    expect(fmt(periodContaining(d('2026-03-31'), month(31)))).toBe('2026-03-31..2026-04-29');
    expect(fmt(periodContaining(d('2026-04-30'), month(31)))).toBe('2026-04-30..2026-05-30');
    // 30 → 29 février en année bissextile
    expect(fmt(periodContaining(d('2024-02-29'), month(30)))).toBe('2024-02-29..2024-03-29');
    expect(fmt(periodContaining(d('2024-02-28'), month(30)))).toBe('2024-01-30..2024-02-28');
    // 29 → 28 février hors bissextile
    expect(fmt(periodContaining(d('2026-03-01'), month(29)))).toBe('2026-02-28..2026-03-28');
  });

  it('les périodes consécutives se touchent sans trou ni chevauchement sur 4 ans', () => {
    for (let startDay = 1; startDay <= 31; startDay++) {
      let p = periodContaining(d('2024-01-01'), month(startDay));
      for (let i = 0; i < 48; i++) {
        const n = nextPeriod(p, month(startDay));
        expect(n.start.equals(p.end.add({ days: 1 }))).toBe(true);
        expect(fmt(previousPeriod(n, month(startDay)))).toBe(fmt(p));
        expect(Temporal.PlainDate.compare(n.start, n.end)).toBeLessThanOrEqual(0);
        p = n;
      }
    }
  });

  it('chaque jour appartient à la période qui le contient', () => {
    let day = d('2027-12-25');
    for (let i = 0; i < 400; i++) {
      for (const startDay of [1, 15, 28, 29, 30, 31]) {
        const p = periodContaining(day, month(startDay));
        expect(Temporal.PlainDate.compare(p.start, day)).toBeLessThanOrEqual(0);
        expect(Temporal.PlainDate.compare(day, p.end)).toBeLessThanOrEqual(0);
      }
      day = day.add({ days: 1 });
    }
  });

  it.each([0, 32, 1.5, Number.NaN])('refuse le jour de début %s', (startDay) => {
    expect(() => periodContaining(d('2026-01-01'), month(startDay))).toThrow(RangeError);
  });
});

describe('periodContaining — semaine', () => {
  it('lundi par défaut, du lundi au dimanche', () => {
    // 2026-11-04 est un mercredi
    expect(fmt(periodContaining(d('2026-11-04'), { kind: 'week' }))).toBe('2026-11-02..2026-11-08');
    expect(fmt(periodContaining(d('2026-11-02'), { kind: 'week' }))).toBe('2026-11-02..2026-11-08');
    expect(fmt(periodContaining(d('2026-11-08'), { kind: 'week' }))).toBe('2026-11-02..2026-11-08');
  });

  it('jour de début réglable (ISO : 1 = lundi … 7 = dimanche)', () => {
    expect(fmt(periodContaining(d('2026-11-04'), { kind: 'week', startDay: 7 }))).toBe(
      '2026-11-01..2026-11-07',
    );
    expect(fmt(periodContaining(d('2026-11-04'), { kind: 'week', startDay: 3 }))).toBe(
      '2026-11-04..2026-11-10',
    );
    expect(fmt(periodContaining(d('2026-11-04'), { kind: 'week', startDay: 4 }))).toBe(
      '2026-10-29..2026-11-04',
    );
  });

  it('semaine à cheval sur l’année et sur le changement d’heure', () => {
    expect(fmt(periodContaining(d('2027-01-01'), { kind: 'week' }))).toBe('2026-12-28..2027-01-03');
    expect(fmt(periodContaining(d('2026-03-29'), { kind: 'week' }))).toBe('2026-03-23..2026-03-29');
    expect(
      fmt(nextPeriod(periodContaining(d('2026-10-25'), { kind: 'week' }), { kind: 'week' })),
    ).toBe('2026-10-26..2026-11-01');
  });

  it.each([0, 8, 2.5])('refuse le jour de semaine %s', (startDay) => {
    expect(() => periodContaining(d('2026-01-01'), { kind: 'week', startDay })).toThrow(RangeError);
  });
});

describe('todayIn', () => {
  it.each([
    // Autour de minuit local, hiver (Paris UTC+1, Lisbonne UTC+0, Montréal UTC−5, Réunion UTC+4)
    ['2026-02-28T22:59:59.999Z', ['2026-02-28', '2026-02-28', '2026-02-28', '2026-03-01']],
    ['2026-02-28T23:00:00Z', ['2026-03-01', '2026-02-28', '2026-02-28', '2026-03-01']],
    ['2026-02-28T23:59:59.999Z', ['2026-03-01', '2026-02-28', '2026-02-28', '2026-03-01']],
    ['2026-03-01T00:00:00Z', ['2026-03-01', '2026-03-01', '2026-02-28', '2026-03-01']],
    ['2026-03-01T04:59:59.999Z', ['2026-03-01', '2026-03-01', '2026-02-28', '2026-03-01']],
    ['2026-03-01T05:00:00Z', ['2026-03-01', '2026-03-01', '2026-03-01', '2026-03-01']],
    ['2026-02-28T19:59:59.999Z', ['2026-02-28', '2026-02-28', '2026-02-28', '2026-02-28']],
    ['2026-02-28T20:00:00Z', ['2026-02-28', '2026-02-28', '2026-02-28', '2026-03-01']],
    // Passage à l'heure d'été en Europe : 2026-03-29 à 01:00 UTC
    ['2026-03-28T22:59:59Z', ['2026-03-28', '2026-03-28', '2026-03-28', '2026-03-29']],
    ['2026-03-28T23:00:00Z', ['2026-03-29', '2026-03-28', '2026-03-28', '2026-03-29']],
    ['2026-03-29T00:59:59Z', ['2026-03-29', '2026-03-29', '2026-03-28', '2026-03-29']],
    ['2026-03-29T01:00:00Z', ['2026-03-29', '2026-03-29', '2026-03-28', '2026-03-29']],
    // Été : minuit à Paris = 22:00 UTC, à Lisbonne = 23:00 UTC, à Montréal = 04:00 UTC
    ['2026-03-29T21:59:59Z', ['2026-03-29', '2026-03-29', '2026-03-29', '2026-03-30']],
    ['2026-03-29T22:00:00Z', ['2026-03-30', '2026-03-29', '2026-03-29', '2026-03-30']],
    ['2026-03-29T23:00:00Z', ['2026-03-30', '2026-03-30', '2026-03-29', '2026-03-30']],
    // Passage à l'heure d'été à Montréal : 2026-03-08 à 07:00 UTC (minuit local = 05:00 UTC)
    ['2026-03-08T06:59:59Z', ['2026-03-08', '2026-03-08', '2026-03-08', '2026-03-08']],
    ['2026-03-08T07:00:00Z', ['2026-03-08', '2026-03-08', '2026-03-08', '2026-03-08']],
    ['2026-03-08T04:59:59Z', ['2026-03-08', '2026-03-08', '2026-03-07', '2026-03-08']],
    ['2026-03-08T05:00:00Z', ['2026-03-08', '2026-03-08', '2026-03-08', '2026-03-08']],
    ['2026-03-09T03:59:59Z', ['2026-03-09', '2026-03-09', '2026-03-08', '2026-03-09']],
    ['2026-03-09T04:00:00Z', ['2026-03-09', '2026-03-09', '2026-03-09', '2026-03-09']],
    // Retour à l'heure d'hiver en Europe : 2026-10-25 à 01:00 UTC
    ['2026-10-24T21:59:59Z', ['2026-10-24', '2026-10-24', '2026-10-24', '2026-10-25']],
    ['2026-10-24T22:00:00Z', ['2026-10-25', '2026-10-24', '2026-10-24', '2026-10-25']],
    ['2026-10-25T00:59:59Z', ['2026-10-25', '2026-10-25', '2026-10-24', '2026-10-25']],
    ['2026-10-25T01:00:00Z', ['2026-10-25', '2026-10-25', '2026-10-24', '2026-10-25']],
    ['2026-10-25T22:59:59Z', ['2026-10-25', '2026-10-25', '2026-10-25', '2026-10-26']],
    ['2026-10-25T23:00:00Z', ['2026-10-26', '2026-10-25', '2026-10-25', '2026-10-26']],
    // Retour à l'heure d'hiver à Montréal : 2026-11-01 à 06:00 UTC (minuit du 2 = 05:00 UTC)
    ['2026-11-01T05:59:59Z', ['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01']],
    ['2026-11-01T06:00:00Z', ['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01']],
    ['2026-11-02T04:59:59Z', ['2026-11-02', '2026-11-02', '2026-11-01', '2026-11-02']],
    ['2026-11-02T05:00:00Z', ['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02']],
    // Nouvel an
    ['2026-12-31T23:30:00Z', ['2027-01-01', '2026-12-31', '2026-12-31', '2027-01-01']],
  ] as const)('%s', (instant, expected) => {
    ZONES.forEach((zone, i) => {
      expect(todayIn(zone, at(instant)).toString(), zone).toBe(expected[i]);
    });
  });

  it('refuse un fuseau inconnu', () => {
    expect(() => todayIn('Europe/Atlantis', at('2026-01-01T00:00:00Z'))).toThrow(RangeError);
  });

  it('période de limite du jour : la bascule de mois suit le fuseau de l’utilisateur', () => {
    const instant = at('2026-02-28T23:30:00Z');
    const periods = ZONES.map((z) =>
      fmt(periodContaining(todayIn(z, instant), { kind: 'month', startDay: 1 })),
    );
    expect(periods).toEqual([
      '2026-03-01..2026-03-31',
      '2026-02-01..2026-02-28',
      '2026-02-01..2026-02-28',
      '2026-03-01..2026-03-31',
    ]);
  });
});

describe('conversions CalendarDate ↔ PlainDate', () => {
  it('aller-retour sans fuseau', () => {
    const c = asCalendarDate('2026-03-29');
    expect(toCalendarDate(toPlainDate(c))).toBe('2026-03-29');
  });
});
