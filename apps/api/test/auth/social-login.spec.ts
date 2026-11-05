// F-AUTH-02, ADR-020 : connexion Apple / Google par `id_token`, création ou rattachement de compte.
// Refus, concurrence et journalisation : `social-login-guards.spec`.
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { refreshToken, user } from '../../src/db/schema/index.js';
import { newId } from '../../src/db/uuid.js';
import { http } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import { notebooksOf } from '../support/notebooks.js';
import { useSocialApp } from '../support/social-fixtures.js';
import { createUser } from '../support/users.js';

describe('connexion Apple / Google (F-AUTH-02)', () => {
  const clock = new FakeClock(Date.UTC(2026, 2, 3, 10, 0, 0));
  const ctx = useSocialApp(clock);
  const { db, social, freshEmail, subjectHash, accountByEmail, identitiesOf } = ctx;

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

    const me = await request(http(ctx.app))
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
    const login = await request(http(ctx.app))
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
    const login = await request(http(ctx.app))
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
});
