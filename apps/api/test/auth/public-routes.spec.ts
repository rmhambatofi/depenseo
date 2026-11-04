// §8.3, ADR-018 : toute route exige un jeton d'accès, sauf une liste blanche figée ici. Une route
// ajoutée sans `@Public()` est fermée ; une route rendue publique par erreur fait échouer ce test.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/db/uuid.js';
import { buildOpenApiDocument } from '../../src/openapi.js';
import { http, startTestApp } from '../support/app.js';

const PUBLIC_ROUTES = [
  'GET /api/v1/health',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/social',
  'POST /api/v1/auth/password-reset/request',
  'POST /api/v1/auth/password-reset/confirm',
].sort();

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('routes publiques (liste blanche)', () => {
  let app: INestApplication;
  beforeAll(async () => ({ app } = await startTestApp()));
  afterAll(() => app.close());

  it('seules les routes de la liste blanche répondent sans jeton d’accès ; les autres → 401', async () => {
    const routes = Object.entries(buildOpenApiDocument(app).paths).flatMap(([path, item]) =>
      METHODS.filter((method) => item[method]).map((method) => ({ method, path })),
    );
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length);

    const open: string[] = [];
    for (const { method, path } of routes) {
      const url = path.replace(/\{[^}]+\}/g, newId());
      const res = await request(http(app))[method](url).send({});
      if (res.status === 401) {
        expect(res.headers['www-authenticate'], `${method} ${path}`).toBe('Bearer');
      } else {
        open.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(open.sort()).toEqual(PUBLIC_ROUTES);
  });
});
