import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateSchema } from '../scripts/generate.mjs';

describe('schéma généré', () => {
  it('src/schema.ts est à jour avec apps/api/openapi.json (sinon : pnpm --filter api openapi)', async () => {
    const committed = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8');
    expect(committed).toBe(await generateSchema());
  });
});
