// F-AUTH-02, ADR-020 : connexion Apple / Google par `id_token` — refus (adresse non vérifiée,
// corps invalide), connexions simultanées et journalisation. Création / rattachement : `social-login.spec`.
import { eq } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { userIdentity } from '../../src/db/schema/index.js';
import { newId, uuidToBinary } from '../../src/db/uuid.js';
import { http } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { rawNonce, signIdToken } from '../support/id-tokens.js';
import { testDb } from '../support/jobs.js';
import { notebooksOf } from '../support/notebooks.js';
import { useSocialApp } from '../support/social-fixtures.js';
import { createUser } from '../support/users.js';

describe('connexion Apple / Google (F-AUTH-02)', () => {
  const clock = new FakeClock(Date.UTC(2026, 2, 3, 10, 0, 0));
  const ctx = useSocialApp(clock);
  const { pool, db, post, social, freshEmail, subjectHash, accountByEmail, identitiesOf } = ctx;

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
      const me = await request(http(ctx.app))
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
      signer: ctx.signers.google,
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
      expect(ctx.logs.text).not.toContain(secret);
    }
  });
});
