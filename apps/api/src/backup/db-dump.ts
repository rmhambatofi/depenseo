// Export logique de la base en SQL texte (NF-DISP-01, §8.2, ADR-039) : schéma (`SHOW CREATE TABLE`)
// puis données, lues dans un seul instantané cohérent. Écrit en Node pur (pas de `mysqldump`, dont la
// présence n'est pas garantie chez o2switch). Une instruction par ligne : les chaînes sont échappées
// par mysql2 (`\n` → `\\n`), ce qui permet de relire le fichier ligne à ligne à la restauration.
import mysql, { type Connection, type ConnectionOptions, type RowDataPacket } from 'mysql2';

export const DUMP_HEADER = '-- depenseo-dump v1';
export const DUMP_TRAILER = '-- depenseo-dump end';

/** Taille cible d'une instruction INSERT (bien en deçà du `max_allowed_packet` de 16 Mio). */
const INSERT_TARGET_BYTES = 512 * 1024;

/**
 * Connexion de lecture ou d'écriture d'un export : même collation et même fuseau que l'API, mais
 * toutes les valeurs temporelles et numériques en chaînes, recopiées telles quelles (aucune
 * conversion par Date ni par flottant).
 */
export function dumpConnectionOptions(databaseUrl: string): ConnectionOptions {
  return {
    uri: databaseUrl,
    charset: 'UTF8MB4_UNICODE_520_CI',
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
  };
}

export async function openDumpConnection(databaseUrl: string): Promise<Connection> {
  const connection = mysql.createConnection(dumpConnectionOptions(databaseUrl));
  await connection.promise().query("SET time_zone = '+00:00'");
  return connection;
}

/** Filtre de tables (tests : ignorer les tables jetables des autres suites). */
export type TableFilter = (table: string) => boolean;
export interface DumpSink {
  write(text: string): Promise<void>;
}
export interface DumpStats {
  tables: number;
  rows: number;
}

/**
 * Exécute `fn` dans un instantané REPEATABLE READ en lecture seule : toutes les tables sont lues au
 * même instant logique, sans bloquer les écritures de l'API (InnoDB, pas de verrou de table).
 */
export async function withConsistentSnapshot<T>(
  connection: Connection,
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  const c = connection.promise();
  await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try {
    return await fn(connection);
  } finally {
    await c.query('ROLLBACK');
  }
}

export async function baseTables(connection: Connection, include: TableFilter): Promise<string[]> {
  const [rows] = await connection
    .promise()
    .query<({ name: string } & RowDataPacket)[]>(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    );
  return rows.map((row) => row.name).filter(include);
}

/** Colonnes à recopier : les colonnes générées sont recalculées par le serveur à l'insertion. */
export async function storedColumns(connection: Connection, table: string): Promise<string[]> {
  const [rows] = await connection
    .promise()
    .query<({ name: string } & RowDataPacket)[]>(
      "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND EXTRA NOT IN ('VIRTUAL GENERATED', 'STORED GENERATED', 'PERSISTENT GENERATED') ORDER BY ORDINAL_POSITION",
      [table],
    );
  return rows.map((row) => row.name);
}

export async function createTableSql(connection: Connection, table: string): Promise<string> {
  const [[row]] = await connection
    .promise()
    .query<({ 'Create Table': string } & RowDataPacket)[]>(
      `SHOW CREATE TABLE ${mysql.escapeId(table)}`,
    );
  if (!row) throw new Error('SHOW CREATE TABLE sans résultat');
  // Retours à la ligne de mise en forme seulement (aucun commentaire ni défaut multiligne au schéma).
  return row['Create Table'].replace(/\n\s*/g, ' ');
}

async function databaseCollation(connection: Connection): Promise<{ cs: string; co: string }> {
  const [[row]] = await connection
    .promise()
    .query<({ cs: string; co: string } & RowDataPacket)[]>(
      'SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS co FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()',
    );
  if (!row) throw new Error('Base courante introuvable');
  return row;
}

/** Écrit l'export complet ; à appeler dans `withConsistentSnapshot`. */
export async function writeDump(
  connection: Connection,
  sink: DumpSink,
  options: { include?: TableFilter; generatedAt: string },
): Promise<DumpStats> {
  const include = options.include ?? (() => true);
  const { cs, co } = await databaseCollation(connection);
  await sink.write(`${DUMP_HEADER} ${options.generatedAt}\n`);
  await sink.write('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_520_ci;\n');
  await sink.write("SET time_zone = '+00:00';\n");
  // Échappement par antislash (mysql2) : NO_BACKSLASH_ESCAPES ne doit pas être actif.
  await sink.write(
    "SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION';\n",
  );
  await sink.write('SET FOREIGN_KEY_CHECKS = 0;\n');
  await sink.write(`ALTER DATABASE CHARACTER SET ${cs} COLLATE ${co};\n`);

  const stats: DumpStats = { tables: 0, rows: 0 };
  for (const table of await baseTables(connection, include)) {
    stats.tables += 1;
    await sink.write(`${await createTableSql(connection, table)};\n`);
    stats.rows += await writeRows(connection, sink, table);
  }
  await sink.write('SET FOREIGN_KEY_CHECKS = 1;\n');
  await sink.write(`${DUMP_TRAILER}\n`);
  return stats;
}

/**
 * Littéral SQL d'une valeur lue par `dumpConnectionOptions` : seuls chaîne, entier sûr, binaire et
 * NULL sont attendus. Tout autre type (objet JSON de MySQL 8, Date, BIT…) serait réécrit de travers
 * par `mysql.escape` : l'export échoue plutôt que de produire une sauvegarde corrompue.
 */
export function sqlLiteral(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    Buffer.isBuffer(value) ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  ) {
    return mysql.escape(value);
  }
  throw new TypeError(`Type de valeur non pris en charge par l'export : ${typeof value}`);
}

async function writeRows(connection: Connection, sink: DumpSink, table: string): Promise<number> {
  const columns = await storedColumns(connection, table);
  const columnList = columns.map((column) => mysql.escapeId(column)).join(', ');
  const prefix = `INSERT INTO ${mysql.escapeId(table)} (${columnList}) VALUES `;
  let batch: string[] = [];
  let batchBytes = 0;
  let count = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await sink.write(`${prefix}${batch.join(', ')};\n`);
    batch = [];
    batchBytes = 0;
  };
  // Lecture en flux (contre-pression) : une table entière n'est jamais chargée en mémoire.
  const rows = connection
    .query({ sql: `SELECT ${columnList} FROM ${mysql.escapeId(table)}`, rowsAsArray: true })
    .stream();
  for await (const row of rows as AsyncIterable<unknown[]>) {
    const tuple = `(${row.map(sqlLiteral).join(', ')})`;
    batch.push(tuple);
    batchBytes += tuple.length; // unités UTF-16 : approximation suffisante
    count += 1;
    if (batchBytes >= INSERT_TARGET_BYTES) await flush();
  }
  await flush();
  return count;
}
