// Serveur des tests Playwright du back-office (`apps/admin/e2e`, ADR-044) : API complète sur la
// base de test, build réel de `apps/admin`, un administrateur et un compte ordinaire créés au
// démarrage. Compilé par `pnpm --filter api build:e2e` (décorateurs : tsc, pas de simple
// suppression de types). Jamais déployé : `dist-e2e/` n'est produit que pour les tests.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createAdmin } from '../support/admin.js';
import { TEST_ENV } from '../support/app.js';
import { TEST_MIGRATOR_URL } from '../support/db.js';
import { testDb } from '../support/jobs.js';
import { createUser } from '../support/users.js';

const { ADMIN_DIST_DIR, E2E_PORT = '3100', E2E_ACCOUNTS_FILE } = process.env;
if (!ADMIN_DIST_DIR || !E2E_ACCOUNTS_FILE) {
  process.stderr.write('ADMIN_DIST_DIR et E2E_ACCOUNTS_FILE sont requises\n');
  process.exit(1);
}

await runMigrations(TEST_MIGRATOR_URL);
const { pool, db } = testDb(1);
const now = new Date();
const admin = await createAdmin(db, now);
const member = await createUser(db, now);
await pool.promise().end();
// Identifiants de test seulement (base jetable) ; lus par les tests Playwright.
writeFileSync(
  E2E_ACCOUNTS_FILE,
  JSON.stringify({
    admin: { email: admin.email, password: admin.password, totpSecret: admin.totpSecret },
    member: { email: member.email, password: member.password },
  }),
  { mode: 0o600 },
);

const config = loadConfig({ ...TEST_ENV, PORT: E2E_PORT, LOG_LEVEL: 'warn', ADMIN_DIST_DIR });
const app = await createApp(config);
await app.listen(config.PORT, '127.0.0.1');
process.stdout.write(`Serveur e2e prêt sur http://127.0.0.1:${config.PORT}\n`);
