// Invariants de schéma vérifiés via information_schema (§8.2, NF-FMT-01/03, CLAUDE.md 1–6).
// Parcourt toutes les tables de la base courante : une nouvelle migration est contrôlée sans
// modifier ce fichier.
import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

export const EXPECTED_COLLATION = 'utf8mb4_unicode_520_ci';
/**
 * Tables à clé naturelle, sans identifiant UUID : `rate_limit` est adressée par l'empreinte de
 * son seau, jamais synchronisée ni rattachée à un compte (ADR-062).
 */
const NATURAL_PRIMARY_KEYS: Readonly<Record<string, string>> = { rate_limit: 'bucket' };

/** Types interdits : flottants (montants) et TIMESTAMP (converti selon le fuseau de session). */
const FORBIDDEN_TYPES = new Set(['float', 'double', 'real', 'timestamp']);
/** Table technique de drizzle (id SERIAL) et tables jetables des tests (`zz_test_*`). */
export const DEFAULT_EXCLUDED = (table: string): boolean =>
  table === '__drizzle_migrations' || table.startsWith('zz_test_');

interface TableRow extends RowDataPacket {
  name: string;
  collation: string | null;
  engine: string | null;
}
interface ColumnRow extends RowDataPacket {
  tableName: string;
  name: string;
  dataType: string;
  columnType: string;
  collation: string | null;
  precision: number | null;
  key: string;
}
interface IndexRow extends RowDataPacket {
  tableName: string;
  indexName: string;
  columns: string;
}

export interface InvariantOptions {
  include?: (table: string) => boolean;
}

/** Liste des violations, vide si le schéma respecte les invariants. */
export async function schemaViolations(
  connection: mysql.Connection,
  { include = (t) => !DEFAULT_EXCLUDED(t) }: InvariantOptions = {},
): Promise<string[]> {
  const [tables] = await connection.query<TableRow[]>(
    `SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation, ENGINE AS engine
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  const [columns] = await connection.query<ColumnRow[]>(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, DATA_TYPE AS dataType,
            COLUMN_TYPE AS columnType, COLLATION_NAME AS collation,
            DATETIME_PRECISION AS \`precision\`, COLUMN_KEY AS \`key\`
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const [indexes] = await connection.query<IndexRow[]>(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME`,
  );

  const violations: string[] = [];
  for (const table of tables.filter((t) => include(t.name))) {
    const t = table.name;
    if (table.collation !== EXPECTED_COLLATION) {
      violations.push(`${t}: collation de table ${table.collation}`);
    }
    if (table.engine?.toLowerCase() !== 'innodb') violations.push(`${t}: moteur ${table.engine}`);

    const cols = columns.filter((c) => c.tableName === t);
    const byName = new Map(cols.map((c) => [c.name, c]));
    for (const c of cols) {
      const type = c.dataType.toLowerCase();
      if (FORBIDDEN_TYPES.has(type)) violations.push(`${t}.${c.name}: type interdit ${type}`);
      if (c.collation !== null && c.collation !== EXPECTED_COLLATION) {
        violations.push(`${t}.${c.name}: collation ${c.collation}`);
      }
      if (type === 'datetime' && Number(c.precision) !== 3) {
        violations.push(`${t}.${c.name}: DATETIME(${c.precision}) au lieu de DATETIME(3)`);
      }
      // Invariant 1, par nom de colonne : montant en centimes, devise ISO 4217, taux exact.
      if (/(^|_)amount($|_)/.test(c.name) && type !== 'bigint') {
        violations.push(`${t}.${c.name}: montant ${type} au lieu de bigint`);
      }
      if (/(^|_)currency$/.test(c.name) && c.columnType !== 'char(3)') {
        violations.push(`${t}.${c.name}: devise ${c.columnType} au lieu de char(3)`);
      }
      if (/(^|_)rate$/.test(c.name) && c.columnType !== 'decimal(18,8)') {
        violations.push(`${t}.${c.name}: taux ${c.columnType} au lieu de decimal(18,8)`);
      }
      if ((c.name === 'id' || c.name.endsWith('_id')) && c.columnType !== 'binary(16)') {
        violations.push(`${t}.${c.name}: identifiant ${c.columnType} au lieu de binary(16)`);
      }
    }
    const primaryKey = NATURAL_PRIMARY_KEYS[t] ?? 'id';
    if (byName.get(primaryKey)?.key !== 'PRI') {
      violations.push(`${t}: clé primaire \`${primaryKey}\` absente`);
    }

    // Table synchronisée = table rattachée à un carnet (CLAUDE.md invariant 6, ADR-015).
    if (byName.has('notebook_id')) {
      for (const required of ['updated_at', 'deleted_at']) {
        const column = byName.get(required);
        if (!column) violations.push(`${t}: colonne ${required} absente`);
        else if (column.dataType.toLowerCase() !== 'datetime') {
          violations.push(`${t}.${required}: ${column.dataType} au lieu de datetime`);
        }
      }
      const hasSyncIndex = indexes.some(
        (i) => i.tableName === t && i.columns === 'notebook_id,updated_at,id',
      );
      if (!hasSyncIndex) violations.push(`${t}: index (notebook_id, updated_at, id) absent`);
    }
  }
  return violations;
}
