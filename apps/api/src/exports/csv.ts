// Export CSV (F-EXP-01, ADR-036) : RFC 4180 (CRLF, guillemets doublés), BOM UTF-8 pour Excel.
// Français : séparateur « ; » et virgule décimale (ouverture directe dans un tableur réglé en
// français) ; anglais : « , » et point. Montant = chaîne décimale exacte, sans groupement ni
// symbole, pour rester numérique une fois importé. Textes saisis commençant par = + - @ ou une
// tabulation : préfixés d'une apostrophe (injection de formule, recommandation OWASP).
import { asCents, asCurrencyCode, decimalAmount } from '@depenseo/shared';
import { EXPORT_LABELS, type ExportLanguage, type ExportRow } from './export-format.js';

const BOM = '\uFEFF';
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string, separator: string): string {
  if (/["\r\n]/.test(value) || value.includes(separator)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function text(value: string | null): string {
  if (value === null) return '';
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function buildCsv(rows: readonly ExportRow[], language: ExportLanguage): Buffer {
  const labels = EXPORT_LABELS[language];
  const separator = language === 'fr' ? ';' : ',';
  const decimal = language === 'fr' ? ',' : '.';
  const line = (values: string[]) => values.map((v) => cell(v, separator)).join(separator);
  const body = rows.map((row) =>
    line([
      row.date,
      decimalAmount(asCents(row.amount), asCurrencyCode(row.currency), decimal),
      row.currency,
      text(row.category),
      text(row.subcategory),
      text(row.merchant),
      text(row.note),
      text(row.tags.join(', ')),
      labels.source[row.source],
    ]),
  );
  const content = [line([...labels.headers]), ...body].map((l) => `${l}\r\n`).join('');
  return Buffer.from(BOM + content, 'utf8');
}
