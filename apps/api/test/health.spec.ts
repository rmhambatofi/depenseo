import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { http, startTestApp } from './support/app.js';

describe('GET /api/v1/health', () => {
  let app: INestApplication;
  beforeAll(async () => ({ app } = await startTestApp()));
  afterAll(() => app.close());

  it('répond 200 en JSON', async () => {
    const res = await request(http(app)).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('n’est pas servie hors du préfixe /api/v1', async () => {
    const res = await request(http(app)).get('/health');
    expect(res.status).toBe(404);
  });

  it('n’ouvre aucune autorisation CORS ni en-tête X-Powered-By', async () => {
    const res = await request(http(app))
      .options('/api/v1/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const get = await request(http(app))
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(get.headers['access-control-allow-origin']).toBeUndefined();
    expect(get.headers['x-powered-by']).toBeUndefined();
  });
});
