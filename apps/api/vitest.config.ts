import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
