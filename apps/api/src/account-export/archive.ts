// Archive de l'export RGPD (F-AUTH-08, ADR-038) : zip contenant les données en JSON (un seul
// fichier, toutes les tables) et en CSV (un fichier par table), plus une notice. Format lisible par
// machine (portabilité, art. 20) : clés et colonnes techniques, montants en unités mineures.
import { strToU8, zipSync } from 'fflate';
import { BOM, csvCell, csvText } from '../exports/csv.js';
import type { PersonalData, PlainRow, PlainValue } from './personal-data.js';

export const ARCHIVE_JSON = 'depenseo.json';
export const csvEntry = (table: string) => `csv/${table}.csv`;

const NOTICE = [
  'Depenseo — export de vos données personnelles / personal data export',
  '',
  `${ARCHIVE_JSON} : toutes les tables / all tables (JSON).`,
  'csv/<table>.csv : une table par fichier, séparateur « , », UTF-8 / one table per file.',
  'Montants (amount) : entiers en unités mineures de la devise (centimes) / integer minor units.',
  'Dates (AAAA-MM-JJ) : calendaires / calendar dates ; horodatages ISO 8601 en UTC / UTC timestamps.',
  'CSV : un texte commençant par = + - @ est précédé d’une apostrophe (protection des tableurs) ; le JSON est exact.',
  'deletedAt renseigné : élément supprimé, conservé jusqu’à sa purge / deleted, kept until purge.',
  '',
].join('\r\n');

function csvValue(value: PlainValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return csvText(value);
  return String(value);
}

/** CSV RFC 4180 d'une table ; en-tête = propriétés de la première ligne (vide si aucune ligne). */
export function tableCsv(rows: readonly PlainRow[]): Buffer {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const line = (values: string[]) => values.map((v) => csvCell(v, ',')).join(',');
  const lines = [
    line(headers),
    ...rows.map((row) => line(headers.map((h) => csvValue(row[h] ?? null)))),
  ];
  return Buffer.from(BOM + lines.map((l) => `${l}\r\n`).join(''), 'utf8');
}

export function buildAccountArchive(data: PersonalData, generatedAt: Date): Buffer {
  const entries: Record<string, Uint8Array> = {
    'LISEZMOI.txt': strToU8(NOTICE),
    [ARCHIVE_JSON]: strToU8(
      JSON.stringify(
        {
          format: 'depenseo-account-export',
          version: 1,
          generatedAt: generatedAt.toISOString(),
          tables: data,
        },
        null,
        2,
      ),
    ),
  };
  for (const [table, rows] of Object.entries(data)) entries[csvEntry(table)] = tableCsv(rows);
  return Buffer.from(zipSync(entries, { level: 6, mtime: generatedAt }));
}
