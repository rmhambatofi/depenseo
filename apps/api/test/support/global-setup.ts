// Avant toute suite : base de test vidée puis migrée depuis zéro (rejouabilité, ADR-015).
import { runMigrations } from '../../src/db/migrate.js';
import { TEST_MIGRATOR_URL, migratorConnection } from './db.js';

export default async function setup(): Promise<void> {
  const connection = await migratorConnection();
  try {
    const [[row]] =
      await connection.query<({ db: string | null } & import('mysql2').RowDataPacket)[]>(
        'SELECT DATABASE() AS db',
      );
    // Garde-fou : ne jamais vider une base qui n'est pas une base de test.
    if (!row?.db?.endsWith('_test')) throw new Error(`Base de test attendue, reçu ${row?.db}`);
    const [tables] = await connection.query<({ name: string } & import('mysql2').RowDataPacket)[]>(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) await connection.query(`DROP TABLE \`${name}\``);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    // Base « cPanel » : la première migration doit rétablir la collation commune (ADR-015).
    await connection.query('ALTER DATABASE CHARACTER SET latin1 COLLATE latin1_swedish_ci');
  } finally {
    await connection.end();
  }
  await runMigrations(TEST_MIGRATOR_URL);
}
