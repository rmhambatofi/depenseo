// Outils communs aux suites de connexion Apple / Google (F-AUTH-02, ADR-020).
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import { user, userIdentity } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { http, type LogCapture, startTestApp } from './app.js';
import type { FakeClock } from './clock.js';
import {
  type FakeProvider,
  fakeProvider,
  rawNonce,
  signIdToken,
  type TokenOptions,
} from './id-tokens.js';
import { testDb } from './jobs.js';

export type Provider = TokenOptions['provider'];

/**
 * Démarre l'application avec de faux fournisseurs Apple / Google (crochets `beforeAll` /
 * `afterAll` de la suite appelante) ; `app`, `logs` et `signers` sont lus après démarrage.
 */
export function useSocialApp(clock: FakeClock) {
  const { pool, db } = testDb(2);
  let app: INestApplication;
  let logs: LogCapture;
  let signers: Record<Provider, FakeProvider>;

  beforeAll(async () => {
    signers = { apple: await fakeProvider('apple-1'), google: await fakeProvider('google-1') };
    ({ app, logs } = await startTestApp({
      clock,
      idTokenKeys: { apple: signers.apple.keys, google: signers.google.keys },
    }));
  });

  afterAll(async () => {
    await app.close();
    await pool.promise().end();
  });

  const post = (body: Record<string, unknown>): request.Test =>
    request(http(app)).post('/api/v1/auth/social').send(body);

  /** Jeton valide pour `provider` ; renvoie le corps de requête complet. */
  async function social(
    provider: Provider,
    sub: string,
    claims: TokenOptions['claims'],
    extra: Record<string, unknown> = {},
  ): Promise<request.Response> {
    const nonce = rawNonce();
    const idToken = await signIdToken({
      provider,
      signer: signers[provider],
      now: clock.now(),
      nonce,
      sub,
      claims,
    });
    return post({ provider, idToken, nonce, ...extra });
  }

  const freshEmail = () => `social.${newId()}@example.test`;
  const subjectHash = (sub: string) => createHash('sha256').update(sub, 'utf8').digest();
  const accountByEmail = async (email: string) =>
    (await db.select().from(user).where(eq(user.email, email)))[0];
  const identitiesOf = (userId: string) =>
    db.select().from(userIdentity).where(eq(userIdentity.userId, userId));

  return {
    pool,
    db,
    get app() {
      return app;
    },
    get logs() {
      return logs;
    },
    get signers() {
      return signers;
    },
    post,
    social,
    freshEmail,
    subjectHash,
    accountByEmail,
    identitiesOf,
  };
}
