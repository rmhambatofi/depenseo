// drizzle-kit : génération hors ligne des migrations SQL (`pnpm --filter api db:generate`).
// L'application des migrations passe par `src/db/migrate.ts`, jamais par `drizzle-kit migrate/push`.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  strict: true,
});
