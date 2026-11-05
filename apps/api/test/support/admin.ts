// Comptes administrateurs de test (ADR-042) : rôle attribué comme par `scripts/grant-admin.ts`.
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { grantAdmin } from '../../src/admin/grant-admin.js';
import { totpCode, totpStep } from '../../src/admin/totp.js';
import type { Database } from '../../src/db/connection.js';
import { auditLog } from '../../src/db/schema/index.js';
import { http, TEST_ENV } from './app.js';
import { createUser, type TestUser } from './users.js';

/** Build factice de `apps/admin` (`login/` public, `app/` réservé), pour `ADMIN_DIST_DIR`. */
export const ADMIN_DIST_FIXTURE = fileURLToPath(new URL('../fixtures/admin-dist', import.meta.url));

/** Seules routes du back-office accessibles sans session (ADR-042, ADR-044). */
export const PUBLIC_ADMIN_ROUTES = [
  'post /admin/api/session',
  'get /admin/login',
  'get /admin/login/assets/:file',
] as const;

/** Pages et fichiers de l'application `apps/admin` (hors API `/admin/api/*`). */
export const ADMIN_CONSOLE_ROUTES = [
  '/admin',
  '/admin/assets/:file',
  '/admin/login',
  '/admin/login/assets/:file',
];

export const ADMIN_TOTP_KEY = Buffer.from(TEST_ENV.ADMIN_TOTP_KEY, 'base64');

export interface TestAdmin extends TestUser {
  /** Secret TOTP en base32 (celui de l'URI d'enrôlement). */
  totpSecret: string;
}

export async function createAdmin(db: Database, now: Date): Promise<TestAdmin> {
  const account = await createUser(db, now);
  const { otpauthUri } = await grantAdmin(db, ADMIN_TOTP_KEY, account.email, now);
  return { ...account, totpSecret: new URL(otpauthUri).searchParams.get('secret')! };
}

export const codeAt = (admin: TestAdmin, now: Date, offsetSteps = 0) =>
  totpCode(admin.totpSecret, totpStep(now) + offsetSteps);

export function adminLogin(
  app: INestApplication,
  account: Pick<TestUser, 'email' | 'password'>,
  code: string,
) {
  return request(http(app))
    .post('/admin/api/session')
    .send({ email: account.email, password: account.password, code });
}

/** Cookie `nom=valeur` à renvoyer, extrait d'une connexion réussie. */
export function sessionCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((line) => line.startsWith('depenseo_admin='));
  if (!cookie) throw new Error(`pas de cookie admin (${res.status})`);
  return cookie.split(';')[0]!;
}

export async function auditOf(db: Database, actorUserId: string, action?: string) {
  return db
    .select({ action: auditLog.action, route: auditLog.route, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(
      action
        ? and(eq(auditLog.actorUserId, actorUserId), eq(auditLog.action, action))
        : eq(auditLog.actorUserId, actorUserId),
    )
    .orderBy(auditLog.createdAt, auditLog.id);
}

/**
 * Routes réellement montées dans Express (y compris celles exclues de l'OpenAPI), hors gestionnaire
 * générique de Nest pour le préfixe exclu (`/admin{/*rest}`, toutes méthodes → 404).
 */
export function mountedRoutes(app: INestApplication): { method: string; path: string }[] {
  const express = app.getHttpAdapter().getInstance() as {
    router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
  };
  return express.router.stack.flatMap((layer) =>
    layer.route && !layer.route.path.includes('*')
      ? Object.keys(layer.route.methods)
          .filter((method) => method !== '_all')
          .map((method) => ({ method, path: layer.route!.path }))
      : [],
  );
}
