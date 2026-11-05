// NF-SEC-01, NF-SEC-04 (MASVS-NETWORK, ADR-062) : en-têtes de sécurité sur toute réponse HTTP.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONSOLE_CSP } from '../../src/admin/admin-console.js';
import { API_CSP } from '../../src/http/security-headers.js';
import { ADMIN_DIST_FIXTURE } from '../support/admin.js';
import { http, startTestApp } from '../support/app.js';

const COMMON = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

describe('en-têtes de sécurité (NF-SEC-01, NF-SEC-04)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startTestApp({ env: { ADMIN_DIST_DIR: ADMIN_DIST_FIXTURE } }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('CSP de l’API : rien ne peut être chargé, exécuté ni encadré', () => {
    expect(API_CSP).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it.each([
    ['sonde publique', 'get', '/api/v1/health', 200],
    ['route protégée sans jeton', 'get', '/api/v1/me', 401],
    ['corps invalide', 'post', '/api/v1/auth/login', 400],
    ['route inconnue', 'get', '/api/v1/inexistante', 404],
    ['back-office sans rôle', 'get', '/admin/api/users', 404],
  ] as const)(
    '%s : HSTS, CSP stricte et anti-encadrement',
    async (_label, method, path, status) => {
      const res = await request(http(app))[method](path).send({});
      expect(res.status).toBe(status);
      expect(res.headers).toMatchObject({ ...COMMON, 'content-security-policy': API_CSP });
      expect(res.headers).not.toHaveProperty('x-powered-by');
    },
  );

  it('pages du back-office : leur propre CSP remplace celle de l’API, le reste est conservé', async () => {
    const res = await request(http(app)).get('/admin/login');
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({ ...COMMON, 'content-security-policy': CONSOLE_CSP });
  });
});
