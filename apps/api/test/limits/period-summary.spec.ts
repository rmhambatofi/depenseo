// Résumé de période (F-LIM-03/05, ADR-028) : découpage des périodes selon l'historique des limites
// et calcul dépensé / restant / rythme. Calcul pur en dates calendaires.
import { describe, expect, it } from 'vitest';
import {
  type DayTotal,
  periodSlices,
  type SummaryVersion,
  summarize,
} from '../../src/limits/period-summary.js';

let seq = 0;
const version = (
  effectiveDate: string,
  amount: number | null,
  over: Partial<SummaryVersion> = {},
): SummaryVersion => ({
  id: `v${++seq}`,
  effectiveDate,
  periodKind: 'month',
  startDay: 1,
  amount,
  currency: 'EUR',
  includeRecurring: true,
  ...over,
});
const span = (s: { start: string; end: string }) => `${s.start}..${s.end}`;
const day = (
  spentOn: string,
  total: number,
  source: DayTotal['source'] = 'manual',
  currency = 'EUR',
): DayTotal => ({ spentOn, source, currency, total: BigInt(total) });

describe('periodSlices (F-LIM-03, ADR-028)', () => {
  it('sans limite : mois civils, aucune version', () => {
    const slices = periodSlices([], '2026-03-18', 3);
    expect(slices.map(span)).toEqual([
      '2026-03-01..2026-03-31',
      '2026-02-01..2026-02-28',
      '2026-01-01..2026-01-31',
    ]);
    expect(slices.every((s) => s.version === undefined)).toBe(true);
  });

  it('début le 31 : repli en fin de mois (février → 28)', () => {
    const v = version('2026-01-05', 100_000, { startDay: 31 });
    const slices = periodSlices([v], '2026-03-18', 4);
    expect(slices.map(span)).toEqual([
      '2026-02-28..2026-03-30',
      '2026-01-31..2026-02-27',
      '2025-12-31..2026-01-30',
      '2025-11-30..2025-12-30',
    ]);
    // La première version vaut dès le début de sa période ; avant, pas de limite mais même règle.
    expect(slices.map((s) => s.version?.id)).toEqual([v.id, v.id, v.id, undefined]);
  });

  it('semaine du lundi au dimanche par défaut', () => {
    const v = version('2026-03-02', 20_000, { periodKind: 'week', startDay: 1 });
    // 2026-03-18 est un mercredi.
    expect(periodSlices([v], '2026-03-18', 2).map(span)).toEqual([
      '2026-03-16..2026-03-22',
      '2026-03-09..2026-03-15',
    ]);
  });

  it('mois → semaine le 18 mars : l’ancien mois est tronqué au 15 (ADR-027)', () => {
    const m = version('2026-01-01', 100_000);
    const w = version('2026-03-18', 25_000, { periodKind: 'week' });
    const slices = periodSlices([m, w], '2026-03-18', 3);
    expect(slices.map(span)).toEqual([
      '2026-03-16..2026-03-22',
      '2026-03-01..2026-03-15',
      '2026-02-01..2026-02-28',
    ]);
    expect(slices.map((s) => s.version?.id)).toEqual([w.id, m.id, m.id]);
  });

  it('semaine → mois le mercredi 18 mars : le mois courant commence le lundi 16', () => {
    const w = version('2026-03-02', 25_000, { periodKind: 'week' });
    const m = version('2026-03-18', 100_000);
    const slices = periodSlices([w, m], '2026-03-20', 3);
    expect(slices.map(span)).toEqual([
      '2026-03-16..2026-03-31',
      '2026-03-09..2026-03-15',
      '2026-03-02..2026-03-08',
    ]);
  });

  it('deux modifications dans le même mois : la plus récente vaut pour tout le mois', () => {
    const a = version('2026-03-03', 10_000);
    const b = version('2026-03-10', 20_000);
    const slices = periodSlices([a, b], '2026-03-18', 2);
    expect(slices.map((s) => s.version?.id)).toEqual([b.id, undefined]);
    expect(slices.map(span)).toEqual(['2026-03-01..2026-03-31', '2026-02-01..2026-02-28']);
  });

  it('version de demain (fuseau vers l’ouest) : la période courante s’arrête la veille', () => {
    const m = version('2026-01-01', 100_000);
    const w = version('2026-03-19', 25_000, { periodKind: 'week' });
    // La version du jeudi 19 vaut dès le lundi 16 : le 15, le mois courant s'arrête au 15.
    expect(periodSlices([m, w], '2026-03-15', 1).map(span)).toEqual(['2026-03-01..2026-03-15']);
  });

  it('version de demain dans la période en cours : déjà en vigueur depuis le lundi (ADR-027)', () => {
    const m = version('2026-01-01', 100_000);
    const w = version('2026-03-19', 25_000, { periodKind: 'week' });
    const [current, previous] = periodSlices([m, w], '2026-03-17', 2);
    expect(current!.version?.id).toBe(w.id);
    expect([span(current!), span(previous!)]).toEqual([
      '2026-03-16..2026-03-22',
      '2026-03-01..2026-03-15',
    ]);
  });

  it('changement d’année et année bissextile', () => {
    const v = version('2027-12-01', 1_000, { periodKind: 'week', startDay: 4 });
    // 2028-01-01 est un samedi ; semaines du jeudi au mercredi.
    expect(periodSlices([v], '2028-01-01', 1).map(span)).toEqual(['2027-12-30..2028-01-05']);
    expect(periodSlices([], '2028-02-29', 2).map(span)).toEqual([
      '2028-02-01..2028-02-29',
      '2028-01-01..2028-01-31',
    ]);
  });
});

describe('summarize (F-LIM-03, F-LIM-05)', () => {
  const v = version('2026-01-01', 100_000);
  const [current] = periodSlices([v], '2026-03-12', 1);

  it('dépensé, restant et rythme « 62 % consommé à 40 % du mois »', () => {
    const totals = [day('2026-03-01', 30_000), day('2026-03-12', 32_000), day('2026-02-28', 999)];
    expect(summarize(current!, '2026-03-12', totals, 'EUR')).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
      periodKind: 'month',
      startDay: 1,
      limitId: v.id,
      limit: 100_000,
      currency: 'EUR',
      includeRecurring: true,
      spent: 62_000,
      remaining: 38_000,
      consumedPercent: 62,
      elapsedDays: 12,
      totalDays: 31,
      elapsedPercent: 38,
      otherCurrencies: [],
    });
  });

  it('dépassement : restant négatif, pourcentage au-delà de 100 (arrondi inférieur)', () => {
    const s = summarize(current!, '2026-03-12', [day('2026-03-05', 123_456)], 'EUR');
    expect(s).toMatchObject({ spent: 123_456, remaining: -23_456, consumedPercent: 123 });
  });

  it('récurrences exclues selon la version (F-LIM-05)', () => {
    const totals = [day('2026-03-02', 1_000), day('2026-03-02', 50_000, 'recurrence')];
    expect(summarize(current!, '2026-03-12', totals, 'EUR').spent).toBe(51_000);
    const [noRec] = periodSlices(
      [version('2026-01-01', 100_000, { includeRecurring: false })],
      '2026-03-12',
      1,
    );
    expect(summarize(noRec!, '2026-03-12', totals, 'EUR')).toMatchObject({
      spent: 1_000,
      includeRecurring: false,
    });
  });

  it('autres devises : ignorées et signalées', () => {
    const totals = [day('2026-03-02', 1_000), day('2026-03-03', 7, 'manual', 'USD')];
    expect(summarize(current!, '2026-03-12', totals, 'CHF')).toMatchObject({
      currency: 'EUR',
      spent: 1_000,
      otherCurrencies: ['USD'],
    });
  });

  it('sans limite : devise du compte, ni restant ni pourcentage consommé', () => {
    const [none] = periodSlices([], '2026-03-12', 1);
    expect(
      summarize(none!, '2026-03-12', [day('2026-03-02', 1_000, 'manual', 'CHF')], 'CHF'),
    ).toMatchObject({
      limitId: null,
      limit: null,
      currency: 'CHF',
      includeRecurring: true,
      spent: 1_000,
      remaining: null,
      consumedPercent: null,
    });
  });

  it('limite supprimée (montant NULL) : comme sans limite', () => {
    const [cleared] = periodSlices([v, version('2026-03-05', null)], '2026-03-12', 1);
    expect(summarize(cleared!, '2026-03-12', [], 'EUR')).toMatchObject({
      limit: null,
      remaining: null,
      consumedPercent: null,
    });
  });

  it('période passée : 100 % écoulée', () => {
    const [, previous] = periodSlices([v], '2026-03-12', 2);
    expect(summarize(previous!, '2026-03-12', [], 'EUR')).toMatchObject({
      elapsedDays: 28,
      totalDays: 28,
      elapsedPercent: 100,
      spent: 0,
    });
  });

  it('sommes au-delà de 2^53 refusées plutôt qu’arrondies', () => {
    const huge = { ...day('2026-03-02', 0), total: 2n ** 53n };
    expect(() => summarize(current!, '2026-03-12', [huge], 'EUR')).toThrow();
  });
});
