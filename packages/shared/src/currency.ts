// Codes de devise ISO 4217 (NF-FMT-01, ADR-011).
// Table figée, et non données Intl/ICU : le nombre de décimales fixe la valeur stockée en BIGINT,
// il doit être identique sur l'API, le mobile et le navigateur quelle que soit la version d'ICU.

declare const currencyBrand: unique symbol;
/** Code ISO 4217 en majuscules, ex. « EUR ». Stocké en CHAR(3) côté base. */
export type CurrencyCode = string & { readonly [currencyBrand]: true };

/** Devises prises en charge et nombre de décimales de leur unité mineure selon ISO 4217. */
const MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  EUR: 2,
  CHF: 2,
  GBP: 2,
  USD: 2,
  CAD: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  CZK: 2,
  HUF: 2,
  RON: 2,
  ISK: 0,
  MAD: 2,
  TND: 3,
  MGA: 2,
  MUR: 2,
  XOF: 0,
  XAF: 0,
  XPF: 0,
  JPY: 0,
});

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(MINOR_UNITS, value);
}

export function asCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) throw new RangeError(`Code devise non pris en charge : « ${value} »`);
  return value;
}

/** Nombre de décimales de l'unité mineure ISO 4217 (EUR → 2, JPY → 0, TND → 3). */
export function minorUnitDigits(currency: CurrencyCode): number {
  return MINOR_UNITS[currency] as number;
}
