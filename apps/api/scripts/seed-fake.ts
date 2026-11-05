// `pnpm --filter api seed:fake` : données fictives en développement et en recette (NF-QUA-03,
// ADR-066). Jamais en production : refusé si la base ne se nomme pas `…_dev`, `…_recette`, `…_test`.
// Variables : DATABASE_URL (compte migrator ou API), SEED_FAKE_PASSWORD (≥ 12 caractères, commun
// aux comptes créés), SEED_FAKE_ACCOUNTS (3 par défaut), SEED_FAKE_EXPENSES (120 par compte).
// Comptes créés : demo.1@example.test, demo.2@example.test… ; rejouable sans doublon.
import { Temporal } from 'temporal-polyfill';
import { createDatabase, createDbPool } from '../src/db/connection.js';
import { SeedFakeError, loadSeedFakeConfig, seedFake } from '../src/dev/seed-fake.js';

let exitCode = 0;
try {
  const config = loadSeedFakeConfig(process.env);
  const pool = createDbPool({ DATABASE_URL: config.databaseUrl, DB_POOL_SIZE: 1 });
  try {
    const result = await seedFake(createDatabase(pool), {
      emailPrefix: 'demo',
      password: config.password,
      accounts: config.accounts,
      expensesPerAccount: config.expensesPerAccount,
      today: Temporal.Now.plainDateISO('Europe/Paris').toString(),
      now: new Date(),
      random: Math.random,
    });
    process.stdout.write(
      `Comptes créés : ${result.created.join(', ') || 'aucun'}\n` +
        `Déjà présents : ${result.skipped.join(', ') || 'aucun'}\n`,
    );
  } finally {
    await pool.promise().end();
  }
} catch (error) {
  // Jamais le message d'une erreur SQL (requête et paramètres).
  const known = error instanceof SeedFakeError;
  process.stderr.write(`${known ? error.message : 'Échec inattendu (base inaccessible ?)'}\n`);
  exitCode = 1;
}
process.exit(exitCode);
