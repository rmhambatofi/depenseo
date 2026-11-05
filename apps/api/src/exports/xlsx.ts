// Export Excel .xlsx (F-EXP-01, Premium, ADR-036) : classeur SpreadsheetML minimal écrit à la main
// et zippé par fflate. Dates = numéros de série Excel (jours depuis 1899-12-30, calcul calendaire
// sans fuseau) au format AAAA-MM-JJ ; montants = valeurs numériques écrites depuis la chaîne
// décimale exacte (jamais de flottant côté API), format selon les décimales de la devise. Textes en
// chaînes en ligne : jamais de formule, pas d'injection possible.
import { asCents, asCurrencyCode, decimalAmount, minorUnitDigits } from '@depenseo/shared';
import { strToU8, zipSync } from 'fflate';
import { Temporal } from 'temporal-polyfill';
import { EXPORT_LABELS, type ExportLanguage, type ExportRow } from './export-format.js';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const COLUMNS = 'ABCDEFGHI';

/** Index de style (`cellXfs`) : 1 en-tête, 2 date, 3/4/5 montant à 0/2/3 décimales. */
const STYLE = { header: 1, date: 2 } as const;
const AMOUNT_STYLE: Record<number, number> = { 0: 3, 2: 4, 3: 5 };

const EXCEL_EPOCH = Temporal.PlainDate.from('1899-12-30');

export function excelDateSerial(date: string): number {
  return EXCEL_EPOCH.until(Temporal.PlainDate.from(date)).days;
}

// Caractères interdits en XML 1.0 (contrôles C0 hors tabulation/sauts, U+FFFE/FFFF, demi-codets isolés).
const XML_INVALID =
  // eslint-disable-next-line no-control-regex -- motif volontaire : contrôles interdits en XML
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function escapeXml(value: string): string {
  return value
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Cell =
  | { kind: 'text'; value: string | null; style?: number }
  | { kind: 'number'; value: string; style: number };

function cellXml(ref: string, cell: Cell): string {
  if (cell.kind === 'number') return `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`;
  if (cell.value === null || cell.value === '') return '';
  const style = cell.style === undefined ? '' : ` s="${cell.style}"`;
  const space = cell.style === STYLE.header ? '' : ' xml:space="preserve"';
  return `<c r="${ref}" t="inlineStr"${style}><is><t${space}>${escapeXml(cell.value)}</t></is></c>`;
}

function rowXml(index: number, cells: Cell[]): string {
  const xml = cells.map((cell, i) => cellXml(`${COLUMNS[i]}${index}`, cell)).join('');
  return `<row r="${index}">${xml}</row>`;
}

function sheetXml(rows: readonly ExportRow[], language: ExportLanguage): string {
  const labels = EXPORT_LABELS[language];
  const header = labels.headers.map((h): Cell => ({ kind: 'text', value: h, style: STYLE.header }));
  const body = rows.map((row): Cell[] => {
    const currency = asCurrencyCode(row.currency);
    const amountStyle = AMOUNT_STYLE[minorUnitDigits(currency)] ?? AMOUNT_STYLE[2]!;
    return [
      { kind: 'number', value: String(excelDateSerial(row.date)), style: STYLE.date },
      { kind: 'number', value: decimalAmount(asCents(row.amount), currency), style: amountStyle },
      { kind: 'text', value: row.currency },
      { kind: 'text', value: row.category },
      { kind: 'text', value: row.subcategory },
      { kind: 'text', value: row.merchant },
      { kind: 'text', value: row.note },
      { kind: 'text', value: row.tags.join(', ') },
      { kind: 'text', value: labels.source[row.source] },
    ];
  });
  const sheetRows = [header, ...body].map((cells, i) => rowXml(i + 1, cells)).join('');
  return (
    `${XML_DECL}<worksheet xmlns="${MAIN_NS}"><sheetViews><sheetView workbookViewId="0">` +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetData>${sheetRows}</sheetData></worksheet>`
  );
}

const CONTENT_TYPES =
  `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  `${XML_DECL}<Relationships xmlns="${PKG_REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>';

const WORKBOOK_RELS =
  `${XML_DECL}<Relationships xmlns="${PKG_REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
  '</Relationships>';

const STYLES =
  `${XML_DECL}<styleSheet xmlns="${MAIN_NS}">` +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>' +
  '<numFmt numFmtId="165" formatCode="#,##0.000"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function workbookXml(sheetName: string): string {
  return (
    `${XML_DECL}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
}

export function buildXlsx(rows: readonly ExportRow[], language: ExportLanguage): Buffer {
  const zipped = zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'xl/workbook.xml': strToU8(workbookXml(EXPORT_LABELS[language].sheet)),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(rows, language)),
  });
  return Buffer.from(zipped.buffer, zipped.byteOffset, zipped.byteLength);
}
