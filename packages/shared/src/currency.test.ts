import { describe, expect, it } from 'vitest';
import { asCurrencyCode, isCurrencyCode, minorUnitDigits } from './currency.js';

describe('CurrencyCode (ISO 4217)', () => {
  it.each(['EUR', 'USD', 'CHF', 'GBP', 'JPY', 'XOF'])('accepte %s', (code) => {
    expect(isCurrencyCode(code)).toBe(true);
    expect(asCurrencyCode(code)).toBe(code);
  });

  it.each(['eur', 'EU', 'EURO', 'ZZZ', '', 'E1R', 'toString', '__proto__'])(
    'rejette « %s »',
    (code) => {
      expect(isCurrencyCode(code)).toBe(false);
      expect(() => asCurrencyCode(code)).toThrow(RangeError);
    },
  );

  it('donne le nombre de décimales de la devise', () => {
    expect(minorUnitDigits(asCurrencyCode('EUR'))).toBe(2);
    expect(minorUnitDigits(asCurrencyCode('JPY'))).toBe(0);
    expect(minorUnitDigits(asCurrencyCode('TND'))).toBe(3);
  });

  it('suit ISO 4217 et non les données ICU du moteur (HUF et MGA : 2 décimales)', () => {
    expect(minorUnitDigits(asCurrencyCode('HUF'))).toBe(2);
    expect(minorUnitDigits(asCurrencyCode('MGA'))).toBe(2);
  });
});
