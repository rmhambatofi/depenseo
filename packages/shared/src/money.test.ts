import { describe, expect, it } from 'vitest';
import { asCents, formatAmount, isCents, parseAmountInput } from './money.js';
import { asCurrencyCode } from './currency.js';

const EUR = asCurrencyCode('EUR');
const NBSP = '\u00a0';
const NNBSP = '\u202f';
/** Normalise les espaces insécables produites par Intl pour des assertions lisibles. */
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('Cents', () => {
  it('accepte les entiers sûrs, y compris négatifs et zéro', () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(-4250)).toBe(true);
    expect(isCents(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(asCents(4250)).toBe(4250);
  });

  it('rejette les flottants, NaN, infinis et entiers non sûrs (NF-FMT-01)', () => {
    for (const v of [42.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isCents(v)).toBe(false);
      expect(() => asCents(v)).toThrow(RangeError);
    }
  });
});

describe('parseAmountInput (F-DEP-02, NF-FMT-06)', () => {
  it.each([
    ['42.50', 4250],
    ['42,5', 4250],
    ['42,50', 4250],
    ['42', 4200],
    ['0,05', 5],
    [',5', 50],
    ['0', 0],
    ['1 234,56', 123456],
    [`1${NBSP}234,56`, 123456],
    [`1${NNBSP}234,56`, 123456],
    ['  12,30  ', 1230],
    ['1234567,89', 123456789],
    ['1\u2009234,56', 123456],
    ['1 234 567,89', 123456789],
    ['1 234', 123400],
    ['0,00', 0],
    ['.5', 50],
  ])('« %s » → %i centimes', (input, cents) => {
    expect(parseAmountInput(input)).toEqual({ ok: true, cents });
  });

  it.each(['42,505', '1.234', '0,001'])(
    '« %s » : plus de 2 décimales → too_many_decimals',
    (input) => {
      expect(parseAmountInput(input)).toEqual({ ok: false, error: 'too_many_decimals' });
    },
  );

  it.each(['', '   '])('« %s » → empty', (input) => {
    expect(parseAmountInput(input)).toEqual({ ok: false, error: 'empty' });
  });

  it.each([
    'abc',
    '42€',
    '-42',
    '+42',
    '1,234.56',
    '1.234,56',
    '42,',
    '42..5',
    '4 2,5 0',
    '1e3',
    '٤٢',
    '1234 567',
    '12 34',
    '1  234',
    '12\t34',
    '42.',
  ])('« %s » → invalid', (input) => {
    expect(parseAmountInput(input)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejette une saisie démesurée sans calcul coûteux', () => {
    expect(parseAmountInput('9'.repeat(2_000_000))).toEqual({ ok: false, error: 'too_large' });
  });

  it('rejette un montant au-delà des entiers sûrs', () => {
    expect(parseAmountInput('90071992547409,92')).toEqual({ ok: false, error: 'too_large' });
    expect(parseAmountInput('90071992547409,91')).toEqual({
      ok: true,
      cents: Number.MAX_SAFE_INTEGER,
    });
  });
});

describe('formatAmount (NF-FMT-06, NF-FMT-08)', () => {
  it('formate en français : « 1 234,56 € »', () => {
    expect(plain(formatAmount(asCents(123456), EUR, 'fr-FR'))).toBe('1 234,56 €');
  });

  it('formate selon la locale', () => {
    expect(formatAmount(asCents(123456), EUR, 'en-IE')).toBe('€1,234.56');
    expect(plain(formatAmount(asCents(123456), EUR, 'de-DE'))).toBe('1.234,56 €');
  });

  it('formate zéro, les centimes seuls et les négatifs', () => {
    expect(plain(formatAmount(asCents(0), EUR, 'fr-FR'))).toBe('0,00 €');
    expect(plain(formatAmount(asCents(5), EUR, 'fr-FR'))).toBe('0,05 €');
    expect(plain(formatAmount(asCents(-4250), EUR, 'fr-FR'))).toBe('-42,50 €');
    expect(plain(formatAmount(asCents(-5), EUR, 'fr-FR'))).toBe('-0,05 €');
    expect(plain(formatAmount(asCents(-0), EUR, 'fr-FR'))).toBe('0,00 €');
  });

  it('reste exact sur le plus grand entier sûr (aucune division flottante)', () => {
    expect(formatAmount(asCents(Number.MAX_SAFE_INTEGER), EUR, 'en-IE')).toBe(
      '€90,071,992,547,409.91',
    );
  });

  it('respecte les unités mineures de la devise (JPY sans décimale)', () => {
    expect(formatAmount(asCents(1234), asCurrencyCode('JPY'), 'en-US')).toBe('¥1,234');
    expect(formatAmount(asCents(1234), asCurrencyCode('TND'), 'en-US')).toMatch(/1\.234$/);
    expect(formatAmount(asCents(123456), asCurrencyCode('HUF'), 'en-US')).toMatch(/1,234\.56$/);
  });
});
