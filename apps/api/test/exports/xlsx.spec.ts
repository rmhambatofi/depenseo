// Export Excel (F-EXP-01, ADR-036) : classeur SpreadsheetML minimal, dates et montants numériques.
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ExportRow } from '../../src/exports/export-format.js';
import { buildXlsx, excelDateSerial } from '../../src/exports/xlsx.js';

const row = (overrides: Partial<ExportRow> = {}): ExportRow => ({
  date: '2026-01-01',
  amount: 123456,
  currency: 'EUR',
  category: 'Alimentation',
  subcategory: null,
  merchant: null,
  note: null,
  tags: [],
  source: 'manual',
  ...overrides,
});

function open(xlsx: Buffer) {
  const files = unzipSync(new Uint8Array(xlsx));
  const text = (name: string) => strFromU8(files[name]!);
  return { names: Object.keys(files).sort(), text };
}

describe('excelDateSerial', () => {
  it('compte les jours depuis le 1899-12-30, sans fuseau', () => {
    expect(excelDateSerial('1900-03-01')).toBe(61);
    expect(excelDateSerial('2026-01-01')).toBe(46023);
    expect(excelDateSerial('2026-03-29')).toBe(46110);
  });
});

describe('buildXlsx', () => {
  it('contient les parties obligatoires d’un classeur', () => {
    const { names, text } = open(buildXlsx([row()], 'fr'));
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(text('xl/workbook.xml')).toContain('<sheet name="Dépenses" sheetId="1" r:id="rId1"/>');
    expect(text('xl/styles.xml')).toContain('formatCode="yyyy-mm-dd"');
  });

  it('écrit en-têtes, date (numéro de série au format AAAA-MM-JJ) et montant numérique exact', () => {
    const sheet = open(buildXlsx([row({ subcategory: 'Courses', tags: ['a', 'b'] })], 'en')).text(
      'xl/worksheets/sheet1.xml',
    );
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t>Date</t></is></c>');
    expect(sheet).toContain('<c r="I1" t="inlineStr" s="1"><is><t>Source</t></is></c>');
    expect(sheet).toContain('<c r="A2" s="2"><v>46023</v></c>');
    expect(sheet).toContain('<c r="B2" s="4"><v>1234.56</v></c>');
    expect(sheet).toContain('<c r="C2" t="inlineStr"><is><t xml:space="preserve">EUR</t></is></c>');
    expect(sheet).toContain('<c r="E2" t="inlineStr"><is><t xml:space="preserve">Courses</t>');
    expect(sheet).toContain('<c r="H2" t="inlineStr"><is><t xml:space="preserve">a, b</t>');
    expect(sheet).toContain('<c r="I2" t="inlineStr"><is><t xml:space="preserve">Manual</t>');
    expect(sheet).not.toContain('r="F2"'); // cellule vide omise
  });

  it('style de montant selon les décimales de la devise', () => {
    const sheet = open(
      buildXlsx(
        [row({ amount: 1500, currency: 'JPY' }), row({ amount: 1234, currency: 'TND' })],
        'fr',
      ),
    ).text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="B2" s="3"><v>1500</v></c>');
    expect(sheet).toContain('<c r="B3" s="5"><v>1.234</v></c>');
  });

  it('échappe le XML et retire les caractères interdits ; aucune formule possible', () => {
    const sheet = open(buildXlsx([row({ note: '<b>&"x"\u0001=1+1' })], 'fr')).text(
      'xl/worksheets/sheet1.xml',
    );
    expect(sheet).toContain('<t xml:space="preserve">&lt;b&gt;&amp;&quot;x&quot;=1+1</t>');
    expect(sheet).not.toContain('<f>');
  });
});
