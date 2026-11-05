// Export CSV (F-EXP-01, ADR-036) : dates AAAA-MM-JJ, montants selon la langue, protection des cellules.
import { describe, expect, it } from 'vitest';
import { buildCsv } from '../../src/exports/csv.js';
import type { ExportRow } from '../../src/exports/export-format.js';

const row = (overrides: Partial<ExportRow> = {}): ExportRow => ({
  date: '2026-02-03',
  amount: 123456,
  currency: 'EUR',
  category: 'Alimentation',
  subcategory: 'Courses',
  merchant: 'Marché',
  note: null,
  tags: [],
  source: 'manual',
  ...overrides,
});

const lines = (csv: Buffer) =>
  csv
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .split('\r\n');

describe('buildCsv', () => {
  it('français : BOM UTF-8, « ; », virgule décimale sans groupement, dates AAAA-MM-JJ', () => {
    const csv = buildCsv([row(), row({ date: '2026-02-28', amount: 5, subcategory: null })], 'fr');
    expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(lines(csv)).toEqual([
      'Date;Montant;Devise;Catégorie;Sous-catégorie;Marchand;Note;Étiquettes;Origine',
      '2026-02-03;1234,56;EUR;Alimentation;Courses;Marché;;;Saisie',
      '2026-02-28;0,05;EUR;Alimentation;;Marché;;;Saisie',
      '',
    ]);
  });

  it('anglais : « , » et point décimal ; décimales de la devise (JPY, TND)', () => {
    const csv = buildCsv(
      [
        row({ source: 'recurrence', tags: ['a', 'b'] }),
        row({ amount: 1500, currency: 'JPY' }),
        row({ amount: 1234, currency: 'TND' }),
      ],
      'en',
    );
    expect(lines(csv)).toEqual([
      'Date,Amount,Currency,Category,Subcategory,Merchant,Note,Tags,Source',
      '2026-02-03,1234.56,EUR,Alimentation,Courses,Marché,,"a, b",Recurring',
      '2026-02-03,1500,JPY,Alimentation,Courses,Marché,,,Manual',
      '2026-02-03,1.234,TND,Alimentation,Courses,Marché,,,Manual',
      '',
    ]);
  });

  it('met entre guillemets séparateurs, guillemets et sauts de ligne (RFC 4180)', () => {
    const csv = buildCsv([row({ note: 'dîner "chez Léa"; 2e\npartie', merchant: 'A;B' })], 'fr');
    expect(lines(csv)[1]).toBe(
      '2026-02-03;1234,56;EUR;Alimentation;Courses;"A;B";"dîner ""chez Léa""; 2e\npartie";;Saisie',
    );
  });

  it('neutralise les formules (injection CSV) dans les textes saisis', () => {
    const csv = buildCsv(
      [row({ note: '=HYPERLINK("x")', merchant: '+33 6', tags: ['@sum', '-1'] })],
      'fr',
    );
    expect(lines(csv)[1]).toBe(
      `2026-02-03;1234,56;EUR;Alimentation;Courses;'+33 6;"'=HYPERLINK(""x"")";'@sum, -1;Saisie`,
    );
  });

  it('sans dépense : en-tête seul', () => {
    expect(lines(buildCsv([], 'en'))).toEqual([
      'Date,Amount,Currency,Category,Subcategory,Merchant,Note,Tags,Source',
      '',
    ]);
  });
});
