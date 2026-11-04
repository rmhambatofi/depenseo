// F-AUTH-02, ADR-020 : connexion Apple / Google par `id_token`, création ou rattachement de compte.
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refreshToken, user, userIdentity } from '../../src/db/schema/index.js';
import { newId, uuidToBinary } from '../../src/db/uuid.js';
import { http, type LogCapture, startTestApp } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import {
  type FakeProvider,
  fakeProvider,
  rawNonce,
  signIdToken,
  type TokenOptions,
} from '../support/id-tokens.js';
import { testDb } from '../support/jobs.js';
import { notebooksOf } from '../support/notebooks.js';
import { createUser } from '../support/users.js';

type Provider = TokenOptions['provider'];

describe('connexion Apple / Google (F-AUTH-02)', () => {
  const clock = new FakeClock(Date.UTC(2026, 2, 3, 10, 0, 0));
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

  const post = (body: Record<string, unknown>) =>
    request(http(app)).post('/api/v1/auth/social').send(body);

  /** Jeton valide pour `provider` ; renvoie le corps de requête complet. */
  async function social(
    provider: Provider,
    sub: string,
    claims: TokenOptions['claims'],
    extra: Record<string, unknown> = {},
  ) {
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

  it('crée un compte vérifié sans mot de passe à la première connexion, puis le retrouve par `sub`', async () => {
    const email = freshEmail();
    const sub = `g-${newId()}`;
    const res = await social(
      'google',
      sub,
      { email, email_verified: true },
      { acceptTerms: true, language: 'en' },
    );
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });

    const account = await accountByEmail(email);
    expect(account).toMatchObject({
      passwordHash: null,
      language: 'en',
      emailVerifiedAt: clock.now(),
      termsAcceptedAt: clock.now(),
      privacyAcceptedAt: clock.now(),
    });
    const identities = await identitiesOf(account!.id);
    expect(identities).toHaveLength(1);
    expect(identities[0]!.provider).toBe('google');
    expect(Buffer.from(identities[0]!.subjectHash).equals(subjectHash(sub))).toBe(true);
    // Carnet personnel créé avec le compte (P1-09), nommé dans sa langue.
    expect(await notebooksOf(db, account!.id)).toEqual([
      expect.objectContaining({ name: 'My notebook', kind: 'personal', role: 'owner' }),
    ]);

    const me = await request(http(app))
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${(res.body as { accessToken: string }).accessToken}`);
    expect(me.body).toMatchObject({ id: account!.id, email });

    // Reconnexion : adresse changée chez le fournisseur et sans `acceptTerms` → même compte.
    const again = await social('google', sub, { email: freshEmail(), email_verified: true });
    expect(again.status).toBe(200);
    expect(await identitiesOf(account!.id)).toHaveLength(1);
    const families = await db
      .select()
      .from(refreshToken)
      .where(eq(refreshToken.userId, account!.id));
    expect(families).toHaveLength(2);
  });

  it('rattache un compte vérifié de même adresse (casse ignorée) et garde son mot de passe', async () => {
    const account = await createUser(db, clock.now());
    const res = await social('apple', `a.${newId()}`, {
      email: account.email.toUpperCase(),
      email_verified: 'true', // Apple publie parfois une chaîne
    });
    expect(res.status).toBe(200);
    expect(await identitiesOf(account.id)).toHaveLength(1);
    const login = await request(http(app))
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password });
    expect(login.status).toBe(200);
  });

  it('reprend un compte non vérifié : adresse vérifiée, mot de passe effacé, CGU redatées (ADR-017)', async () => {
    const account = await createUser(db, clock.now(), { verified: false });
    clock.advance(60_000);
    const claims = { email: account.email, email_verified: true };
    // Les consentements du compte ont pu être donnés par un tiers : ceux du titulaire sont exigés.
    expect((await social('apple', `a.${newId()}`, claims)).status).toBe(422);
    expect(await identitiesOf(account.id)).toHaveLength(0);

    const res = await social('apple', `a.${newId()}`, claims, {
      acceptTerms: true,
      language: 'en',
    });
    expect(res.status).toBe(200);
    const row = await accountByEmail(account.email);
    expect(row).toMatchObject({
      passwordHash: null,
      emailVerifiedAt: clock.now(),
      termsAcceptedAt: clock.now(),
      privacyAcceptedAt: clock.now(),
      language: 'en',
    });
    const login = await request(http(app))
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password });
    expect(login.status).toBe(401);
  });

  it('un même compte peut porter une identité Apple et une identité Google', async () => {
    const account = await createUser(db, clock.now());
    for (const provider of ['apple', 'google'] as const) {
      const res = await social(provider, `${provider}-${newId()}`, {
        email: account.email,
        email_verified: true,
        hd: 'example.test', // compte Google Workspace du domaine
      });
      expect(res.status).toBe(200);
    }
    expect(await identitiesOf(account.id)).toHaveLength(2);
  });

  it('Google sans autorité sur l’adresse (ni Gmail ni `hd`) : pas de rattachement à un compte existant → 409', async () => {
    for (const verified of [true, false]) {
      const account = await createUser(db, clock.now(), { verified });
      const res = await social(
        'google',
        `g-${newId()}`,
        { email: account.email, email_verified: true },
        { acceptTerms: true },
      );
      expect(res.status).toBe(409);
      expect(await identitiesOf(account.id)).toHaveLength(0);
      expect((await accountByEmail(account.email))!.passwordHash).not.toBeNull();
    }
  });

  it('Google fait autorité sur une adresse Gmail : rattachement', async () => {
    const id = newId();
    const email = `camille.${id}@gmail.com`;
    await db.insert(user).values({
      id,
      email,
      emailVerifiedAt: clock.now(),
      termsAcceptedAt: clock.now(),
      privacyAcceptedAt: clock.now(),
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    const res = await social('google', `g-${newId()}`, { email, email_verified: true });
    expect(res.status).toBe(200);
    expect(await identitiesOf(id)).toHaveLength(1);
  });

  it('création sans `acceptTerms` → 422, rien n’est créé', async () => {
    const email = freshEmail();
    const res = await social('google', `g-${newId()}`, { email, email_verified: true });
    expect(res.status).toBe(422);
    expect(await accountByEmail(email)).toBeUndefined();
  });

  it.each([
    ['adresse non vérifiée', { email_verified: false }],
    ['sans `email_verified`', { email_verified: undefined }],
    ['sans adresse', { email: undefined, email_verified: true }],
    ['adresse illisible', { email: 'pas-une-adresse', email_verified: true }],
  ])('nouvelle identité, %s → 403, rien n’est créé', async (_label, claims) => {
    const email = freshEmail();
    const sub = `g-${newId()}`;
    const res = await social('google', sub, { email, ...claims }, { acceptTerms: true });
    expect(res.status).toBe(403);
    expect(await accountByEmail(email)).toBeUndefined();
    const linked = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.subjectHash, subjectHash(sub)));
    expect(linked).toHaveLength(0);
  });

  it('identité déjà rattachée : connexion même sans adresse dans le jeton', async () => {
    const sub = `a.${newId()}`;
    const email = freshEmail();
    const first = await social(
      'apple',
      sub,
      { email, email_verified: true },
      { acceptTerms: true },
    );
    expect(first.status).toBe(200);
    const again = await social('apple', sub, { email: undefined, email_verified: undefined });
    expect(again.status).toBe(200);
  });

  it('`sub` comparé à la casse près : deux identités distinctes', async () => {
    const base = `AbC${newId()}`;
    const [emailA, emailB] = [freshEmail(), freshEmail()];
    for (const [sub, email] of [
      [base, emailA],
      [base.toLowerCase(), emailB],
    ] as const) {
      const res = await social(
        'google',
        sub,
        { email, email_verified: true },
        { acceptTerms: true },
      );
      expect(res.status).toBe(200);
    }
    const [a, b] = [await accountByEmail(emailA), await accountByEmail(emailB)];
    expect(a!.id).not.toBe(b!.id);
  });

  it('même `sub` chez deux fournisseurs : deux identités distinctes', async () => {
    const sub = `shared-${newId()}`;
    const [emailA, emailB] = [freshEmail(), freshEmail()];
    expect(
      (await social('apple', sub, { email: emailA, email_verified: true }, { acceptTerms: true }))
        .status,
    ).toBe(200);
    expect(
      (await social('google', sub, { email: emailB, email_verified: true }, { acceptTerms: true }))
        .status,
    ).toBe(200);
    expect((await accountByEmail(emailA))!.id).not.toBe((await accountByEmail(emailB))!.id);
  });

  it('premières connexions simultanées d’une même identité : un seul compte, une seule identité', async () => {
    const email = freshEmail();
    const sub = `g-${newId()}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        social('google', sub, { email, email_verified: true }, { acceptTerms: true }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    const account = await accountByEmail(email);
    expect(await identitiesOf(account!.id)).toHaveLength(1);
    expect(await notebooksOf(db, account!.id)).toHaveLength(1);
  });

  it.each([true, false])(
    'rattachements simultanés à un compte existant (vérifié : %s) : une seule identité',
    async (verified) => {
      const account = await createUser(db, clock.now(), { verified });
      const sub = `a.${newId()}`;
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          social(
            'apple',
            sub,
            { email: account.email, email_verified: true },
            { acceptTerms: true },
          ),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
      expect(await identitiesOf(account.id)).toHaveLength(1);
      // Rattachement : le compte garde son seul carnet.
      expect(await notebooksOf(db, account.id)).toHaveLength(1);
    },
  );

  it('même `sub` présenté simultanément avec des adresses différentes : un seul compte', async () => {
    const sub = `a.${newId()}`;
    const emails = Array.from({ length: 4 }, freshEmail);
    const results = await Promise.all(
      emails.map((email) =>
        social('apple', sub, { email, email_verified: true }, { acceptTerms: true }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(4).fill(200));
    const accounts = (await Promise.all(emails.map(accountByEmail))).filter(Boolean);
    expect(accounts).toHaveLength(1);
    expect(await identitiesOf(accounts[0]!.id)).toHaveLength(1);
    expect(await notebooksOf(db, accounts[0]!.id)).toHaveLength(1);
  });

  it('identité rattachée par une autre requête pendant la création du compte : création annulée', async () => {
    const email = freshEmail();
    const sub = `a.${newId()}`;
    const winner = await createUser(db, clock.now());
    // Barrière : une insertion non validée de la même adresse fait attendre la requête sur son
    // verrou (`FOR UPDATE` par adresse) ; pendant ce temps l'identité est rattachée à `winner`.
    const other = testDb(1);
    const holder = await other.pool.promise().getConnection();
    let settled = false;
    try {
      await holder.query('START TRANSACTION');
      await holder.query(
        'INSERT INTO user (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [uuidToBinary(newId()), email, clock.now(), clock.now()],
      );
      const pending = social(
        'apple',
        sub,
        { email, email_verified: true },
        { acceptTerms: true },
      ).then((res) => {
        settled = true;
        return res;
      });
      let waiting = false;
      for (let i = 0; i < 500 && !settled && !waiting; i += 1) {
        const [rows] = await pool
          .promise()
          .query<({ n: number } & RowDataPacket)[]>(
            "SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND COMMAND IN ('Query', 'Execute') AND INFO LIKE '%from `user` where `user`.`email` = %for update%'",
          );
        waiting = Number(rows[0]!.n) > 0;
        if (!waiting) await new Promise((resolve) => setImmediate(resolve));
      }
      expect(waiting).toBe(true);
      await db.insert(userIdentity).values({
        id: newId(),
        userId: winner.id,
        provider: 'apple',
        subjectHash: subjectHash(sub),
        createdAt: clock.now(),
      });
      await holder.query('ROLLBACK');
      const res = await pending;
      expect(res.status).toBe(200);
      const me = await request(http(app))
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${(res.body as { accessToken: string }).accessToken}`);
      expect((me.body as { id: string }).id).toBe(winner.id);
      expect(await accountByEmail(email)).toBeUndefined();
    } finally {
      holder.release();
      await other.pool.promise().end();
    }
  });

  it.each([
    [{}, 'provider, idToken, nonce'],
    [{ provider: 'facebook', idToken: 'x', nonce: 'n'.repeat(16) }, 'provider'],
    [{ provider: 'google', idToken: 'x', nonce: 'court' }, 'nonce'],
    [
      { provider: 'google', idToken: 'x', nonce: 'n'.repeat(16), acceptTerms: false },
      'acceptTerms',
    ],
  ])('corps invalide %o → 400', async (body, fields) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((res.body as { detail: string }).detail).toBe(`Champs invalides : ${fields}`);
  });

  it('ne journalise ni le jeton, ni le nonce, ni l’adresse', async () => {
    const email = freshEmail();
    const nonce = rawNonce();
    const idToken = await signIdToken({
      provider: 'google',
      signer: signers.google,
      now: clock.now(),
      nonce,
      sub: `g-${newId()}`,
      claims: { email, email_verified: true },
    });
    const res = await post({ provider: 'google', idToken, nonce, acceptTerms: true });
    expect(res.status).toBe(200);
    const refused = await post({ provider: 'google', idToken, nonce: rawNonce() });
    expect(refused.status).toBe(401);
    for (const secret of [idToken, nonce, email, idToken.split('.')[1]!]) {
      expect(logs.text).not.toContain(secret);
    }
  });
});
