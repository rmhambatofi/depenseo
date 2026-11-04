// Harnais « l'utilisateur B ne voit ni ne modifie les données de A » (NF-SEC-03, P1-09).
// Utilisé par `test/access/cross-tenant.spec.ts`, qui le passe sur **chaque** route protégée de
// l'OpenAPI : une nouvelle route doit y être classée (carnet ou compte), sinon le test échoue.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Database } from '../../src/db/connection.js';
import { buildOpenApiDocument } from '../../src/openapi.js';
import { http } from './app.js';
import { createUser, type TestUser } from './users.js';

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface Route {
  method: HttpMethod;
  /** Gabarit OpenAPI, ex. `/api/v1/notebooks/{notebookId}`. */
  path: string;
}

export const routeKey = ({ method, path }: Route) => `${method.toUpperCase()} ${path}`;

/** Compte vérifié, son carnet personnel et un jeton d'accès. */
export interface Tenant extends TestUser {
  accessToken: string;
}

export async function createTenant(app: INestApplication, db: Database, now: Date) {
  const account = await createUser(db, now);
  const res = await request(http(app))
    .post('/api/v1/auth/login')
    .send({ email: account.email, password: account.password });
  if (res.status !== 200) throw new Error(`connexion impossible (${res.status})`);
  return { ...account, accessToken: (res.body as { accessToken: string }).accessToken };
}

export function routesOf(app: INestApplication): Route[] {
  return Object.entries(buildOpenApiDocument(app).paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => item[method]).map((method) => ({ method, path })),
  );
}

/**
 * Remplace chaque `{param}` du gabarit. Un paramètre sans valeur fait échouer : une route qui
 * introduit un nouvel identifiant (ex. `{expenseId}`) doit fournir la ressource de A au harnais.
 */
export function fillPath(path: string, params: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`paramètre {${name}} inconnu du harnais d'accès`);
    return value;
  });
}

/** Appelle `route` au nom de `actor`, avec les paramètres de chemin et le corps donnés. */
export function callAs(
  app: INestApplication,
  actor: Tenant,
  route: Route,
  params: Record<string, string>,
  body: object = {},
) {
  const req = request(http(app))
    [route.method](fillPath(route.path, params))
    .set('Authorization', `Bearer ${actor.accessToken}`);
  return route.method === 'get' || route.method === 'delete' ? req : req.send(body);
}

/** Corps RFC 9457 sans `instance` (qui reprend l'URL demandée) : comparable entre deux refus. */
export function problemWithoutInstance(body: unknown): unknown {
  const rest = { ...(body as Record<string, unknown>) };
  delete rest.instance;
  return rest;
}
