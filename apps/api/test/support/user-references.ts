// Recherche générique, par information_schema, des lignes qui référencent un compte (F-AUTH-07) :
// toute table présente ou future est parcourue, sans liste à tenir à jour.
// - colonnes BINARY(16) (UUID) : égalité avec un identifiant de l'ensemble ;
// - colonnes texte (CHAR, VARCHAR, TEXT) : présence d'un identifiant ou d'un marqueur (e-mail…).
import type mysql from 'mysql2/promise';
import { UNLINKED_TABLES } from '../../src/account-export/personal-data.js';
import { binaryToUuid, uuidToBinary } from '../../src/db/uuid.js';

interface Column {
  table: string;
  name: string;
  kind: 'uuid' | 'text';
}

/** Tables et colonnes candidates du schéma courant (hors journal de migrations et tables jetables). */
export async function candidateColumns(connection: mysql.Connection): Promise<Column[]> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS name, c.DATA_TYPE AS dataType,
            c.CHARACTER_OCTET_LENGTH AS octets
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'
        AND c.TABLE_NAME <> '__drizzle_migrations' AND c.TABLE_NAME NOT LIKE 'zz\\_test\\_%'
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
  );
  const columns: Column[] = [];
  for (const row of rows) {
    const type = String(row.dataType).toLowerCase();
    if (type === 'binary' && Number(row.octets) === 16) {
      columns.push({ table: String(row.tableName), name: String(row.name), kind: 'uuid' });
    } else if (
      ['char', 'varchar', 'text', 'mediumtext', 'longtext', 'tinytext', 'json'].includes(type)
    ) {
      columns.push({ table: String(row.tableName), name: String(row.name), kind: 'text' });
    } else if (['varbinary', 'blob', 'mediumblob', 'longblob', 'tinyblob'].includes(type)) {
      // Non parcourus : échouer plutôt que d'ignorer en silence une colonne qui citerait le compte.
      throw new Error(`Type non pris en charge par la recherche : ${row.tableName}.${row.name}`);
    }
  }
  return columns;
}

export async function allTables(connection: mysql.Connection): Promise<string[]> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME <> '__drizzle_migrations' AND TABLE_NAME NOT LIKE 'zz\\_test\\_%'`,
  );
  // Tables qu'aucune ligne ne rattache à un compte : ni exportées ni supprimées avec lui.
  return rows
    .map((r) => String(r.name))
    .filter((name) => !(name in UNLINKED_TABLES))
    .sort();
}

const quote = (identifier: string) => `\`${identifier.replaceAll('`', '``')}\``;

function byTable(columns: Column[]): Map<string, Column[]> {
  const map = new Map<string, Column[]>();
  for (const column of columns) map.set(column.table, [...(map.get(column.table) ?? []), column]);
  return map;
}

/**
 * Fermeture des identifiants rattachés aux racines (compte, carnets) : toute ligne dont une colonne
 * UUID vaut un identifiant connu apporte son propre `id`, jusqu'à point fixe.
 */
export async function ownedIds(
  connection: mysql.Connection,
  roots: string[],
): Promise<Set<string>> {
  const tables = byTable((await candidateColumns(connection)).filter((c) => c.kind === 'uuid'));
  const known = new Set(roots);
  for (let grew = true; grew;) {
    grew = false;
    const ids = [...known].map(uuidToBinary);
    for (const [table, columns] of tables) {
      if (!columns.some((c) => c.name === 'id')) continue;
      const where = columns.map((c) => `${quote(c.name)} IN (?)`).join(' OR ');
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id FROM ${quote(table)} WHERE ${where}`,
        columns.map(() => ids),
      );
      for (const row of rows) {
        const id = binaryToUuid(row.id as Buffer);
        if (!known.has(id)) {
          known.add(id);
          grew = true;
        }
      }
    }
  }
  return known;
}

/**
 * Nombre de lignes, par table, qui référencent l'un des identifiants ou contiennent l'un des
 * marqueurs texte. `ignoreOwnId` : tables dont la clé primaire n'est pas une référence au compte.
 */
export async function referencingRows(
  connection: mysql.Connection,
  ids: Set<string>,
  markers: string[],
  ignoreOwnId: string[] = [],
): Promise<Record<string, number>> {
  const binaries = [...ids].map(uuidToBinary);
  const needles = [...ids, ...markers];
  const counts: Record<string, number> = {};
  for (const [table, columns] of byTable(await candidateColumns(connection))) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const column of columns) {
      if (column.kind === 'uuid') {
        if (column.name === 'id' && ignoreOwnId.includes(table)) continue;
        clauses.push(`${quote(column.name)} IN (?)`);
        params.push(binaries);
      } else {
        for (const needle of needles) {
          clauses.push(`INSTR(${quote(column.name)}, ?) > 0`);
          params.push(needle);
        }
      }
    }
    if (clauses.length === 0) continue;
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${quote(table)} WHERE ${clauses.join(' OR ')}`,
      params,
    );
    const n = Number(rows[0]!.n);
    if (n > 0) counts[table] = n;
  }
  return counts;
}
