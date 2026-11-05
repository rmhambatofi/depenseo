// Banc de charge (NF-PERF-02, ADR-065) : `pnpm --filter api bench`, hors `pnpm test` et sans
// couverture (l'instrumentation v8 fausserait les durées). `mergeConfig` concatène les `include` :
// configuration recopiée plutôt que fusionnée.
import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ['bench/**/*.bench.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['test/support/global-setup.ts'],
  },
});
