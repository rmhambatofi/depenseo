import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument, serializeOpenApi } from '../src/openapi.js';
import { startTestApp } from './support/app.js';

describe('contrat OpenAPI', () => {
  let app: INestApplication;
  beforeAll(async () => ({ app } = await startTestApp()));
  afterAll(() => app.close());

  it('décrit /api/v1/health', () => {
    const doc = buildOpenApiDocument(app);
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths['/api/v1/health']?.get).toBeDefined();
  });

  it('openapi.json committé est à jour (sinon : pnpm --filter api openapi)', () => {
    const committed = readFileSync(new URL('../openapi.json', import.meta.url), 'utf8');
    expect(committed).toBe(serializeOpenApi(buildOpenApiDocument(app)));
  });
});
