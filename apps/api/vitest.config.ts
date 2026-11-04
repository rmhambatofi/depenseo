import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    // Base de test vidée et migrée une fois avant les suites (ADR-015).
    globalSetup: ['test/support/global-setup.ts'],
  },
});
