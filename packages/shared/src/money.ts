// Montants en unités mineures entières (« centimes ») : jamais de flottant (NF-FMT-01, ADR-011).
import { minorUnitDigits, type CurrencyCode } from './currency.js';

declare const centsBrand: unique symbol;
/** Montant entier en unités mineures de sa devise (centimes pour l'euro). Entier sûr, signé. */
export type Cents = number & { readonly [centsBrand]: true };

export function isCents(value: number): value is Cents {
  return Number.isSafeInteger(value);
}

export function asCents(value: number): Cents {
  if (!isCents(value)) throw new RangeError(`Montant non entier ou hors bornes : ${value}`);
  return value;
}

/**
 * Formate un montant selon la locale (« 1 234,56 € » en fr-FR, NF-FMT-06).
 * Le montant est passé à Intl sous forme de chaîne décimale exacte : aucune division flottante.
 */
export function formatAmount(cents: Cents, currency: CurrencyCode, locale: string): string {
  const digits = minorUnitDigits(currency);
  const negative = cents < 0; // -0 n'est pas < 0 : rendu « 0,00 € »
  const abs = String(Math.abs(cents)).padStart(digits + 1, '0');
  const integer = abs.slice(0, abs.length - digits);
  const fraction = abs.slice(abs.length - digits);
  const decimal = `${negative ? '-' : ''}${integer}${digits > 0 ? `.${fraction}` : ''}`;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(decimal as Intl.StringNumericLiteral);
}

export type AmountInputError = 'empty' | 'invalid' | 'too_many_decimals' | 'too_large';
export type AmountInputResult = { ok: true; cents: Cents } | { ok: false; error: AmountInputError };

// Espaces acceptées comme séparateurs de milliers : espace, insécable, fine, fine insécable.
const SPACE = '[ \\u00a0\\u2009\\u202f]';
// Au-delà, la saisie dépasse forcément Number.MAX_SAFE_INTEGER centimes (16 chiffres + séparateurs).
const MAX_INPUT_LENGTH = 40;
const HAS_SPACE = new RegExp(SPACE);
const SPACES = new RegExp(SPACE, 'g');
// Une espace n'est admise qu'entre groupes de 3 chiffres de la partie entière.
const GROUPED = new RegExp(`^\\d{1,3}(?:${SPACE}\\d{3})*(?:[.,]\\d*)?$`);
const AMOUNT = /^(\d*)(?:[.,](\d+))?$/;

/**
 * Lit une saisie utilisateur de montant positif en euros (F-DEP-02) : virgule ou point décimal,
 * au plus 2 décimales, espaces de milliers tolérées. « 42.50 » et « 42,5 » → 4250.
 * Suppose 2 décimales (MVP mono-devise en euros) : à étendre avec la devise quand elles arriveront.
 * Un seul séparateur décimal : « 1.234,56 » et « 1,234.56 » sont refusés plutôt que devinés.
 */
export function parseAmountInput(input: string): AmountInputResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };
  if (trimmed.length > MAX_INPUT_LENGTH) return { ok: false, error: 'too_large' };
  if (HAS_SPACE.test(trimmed) && !GROUPED.test(trimmed)) {
    return { ok: false, error: 'invalid' };
  }
  const match = AMOUNT.exec(trimmed.replace(SPACES, ''));
  if (!match) return { ok: false, error: 'invalid' };
  const integer = match[1] ?? '';
  const fraction = match[2];
  if (integer === '' && fraction === undefined) return { ok: false, error: 'invalid' };
  if (fraction !== undefined && fraction.length > 2)
    return { ok: false, error: 'too_many_decimals' };
  const total = BigInt(integer || '0') * 100n + BigInt((fraction ?? '').padEnd(2, '0'));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'too_large' };
  return { ok: true, cents: Number(total) as Cents };
}
