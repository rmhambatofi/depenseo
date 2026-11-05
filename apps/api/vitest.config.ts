import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Les tests lisent les sources de `@depenseo/shared` ; le build Node lit son `dist` (ADR-022).
    alias: {
      '@depenseo/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    // Base de test vidée et migrée une fois avant les suites (ADR-015).
    globalSetup: ['test/support/global-setup.ts'],
    // Couverture (NF-QUA-01, ADR-061) : activée par `pnpm --filter api test` (`--coverage`), donc en CI.
    // Seuil sur toute la logique de `src/` (l'API n'a pas de dossiers `domain/`/`services/`).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
