// Restauration d'un export `db-dump.ts` dans une base **vide** (NF-DISP-01, ADR-039). Le fichier est
// vérifié en entier (en-tête et marque de fin) avant toute écriture : un export tronqué est refusé.
import type { Connection, RowDataPacket } from 'mysql2';
import { DUMP_HEADER, DUMP_TRAILER } from './db-dump.js';

export class DumpFormatError extends Error {
  override readonly name = 'DumpFormatError';
}

export class TargetNotEmptyError extends Error {
  override readonly name = 'TargetNotEmptyError';
  constructor() {
    super('La base cible contient déjà des tables : restauration refusée');
  }
}

/** Instructions SQL de l'export, après contrôle de son intégrité structurelle. */
export function dumpStatements(dump: string): string[] {
  const lines = dump.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (!lines[0]?.startsWith(`${DUMP_HEADER} `)) throw new DumpFormatError('En-tête absent');
  if (lines.at(-1) !== DUMP_TRAILER) throw new DumpFormatError('Export tronqué (fin absente)');
  return lines.filter((line) => line.length > 0 && !line.startsWith('--'));
}

export async function restoreDump(connection: Connection, dump: string): Promise<number> {
  const statements = dumpStatements(dump);
  const c = connection.promise();
  const [[row]] = await c.query<({ n: number } & RowDataPacket)[]>(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  );
  if (Number(row?.n) !== 0) throw new TargetNotEmptyError();
  for (const statement of statements) await c.query(statement);
  return statements.length;
}
