// Tests de bout en bout du back-office (F-ADM-01/03, ADR-044) : API réelle sur la base de test
// (MariaDB du docker-compose), build réel de `apps/admin` (`pnpm build` avant `playwright test`).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { ACCOUNTS_FILE, E2E_PORT as PORT } from './e2e/accounts-file';
const apiDir = fileURLToPath(new URL('../api', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  // Un seul compte admin et un code TOTP à usage unique par pas de 30 s : exécution en série.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter @depenseo/api build:e2e && node ${join(apiDir, 'dist-e2e/test/e2e/admin-e2e-server.js')}`,
    url: `http://127.0.0.1:${PORT}/admin/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    env: {
      E2E_PORT: String(PORT),
      E2E_ACCOUNTS_FILE: ACCOUNTS_FILE,
      ADMIN_DIST_DIR: fileURLToPath(new URL('./dist', import.meta.url)),
    },
  },
});
