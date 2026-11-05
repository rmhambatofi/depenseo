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

  it('aucun nombre flottant : montants, durées et jours sont des entiers (invariant 1)', () => {
    const floats: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
      if (node === null || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (record.type === 'number') floats.push(path);
      for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
    };
    walk(buildOpenApiDocument(app), '$');
    expect(floats).toEqual([]);
  });
});
