// F-AUTH-02, ADR-020 : refus des `id_token` (signature, `alg`, `iss`, `aud`, `exp`, `nonce`).
import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, errors, exportJWK, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CLOCK_TOLERANCE_S,
  InvalidIdTokenError,
  MAX_TOKEN_AGE_S,
  JoseIdTokenVerifier,
  ProviderUnavailableError,
  providerSettings,
} from '../../src/auth/id-token-verifier.js';
import { loadConfig } from '../../src/config/env.js';
import { TEST_ENV } from '../support/app.js';
import { FakeClock } from '../support/clock.js';
import {
  AUDIENCES,
  type FakeProvider,
  fakeProvider,
  foreignKey,
  hashedNonce,
  ISSUERS,
  rawNonce,
  signIdToken,
  type TokenOptions,
} from '../support/id-tokens.js';

describe('IdTokenVerifier (jose)', () => {
  const clock = new FakeClock(Date.UTC(2026, 2, 3, 10, 0, 0));
  const config = loadConfig(TEST_ENV);
  let apple: FakeProvider;
  let google: FakeProvider;
  let verifier: JoseIdTokenVerifier;

  beforeAll(async () => {
    [apple, google] = [await fakeProvider('apple-1'), await fakeProvider('google-1')];
    verifier = new JoseIdTokenVerifier(
      providerSettings(config, { apple: apple.keys, google: google.keys }),
      clock,
    );
  });

  const nonce = rawNonce();
  const token = (overrides: Partial<TokenOptions> = {}) =>
    signIdToken({
      provider: 'google',
      signer: google,
      now: clock.now(),
      nonce,
      sub: '1234567890',
      claims: { email: 'Camille@Example.test', email_verified: true },
      ...overrides,
    });

  it('accepte un jeton valide et rend `sub` et l’adresse vérifiée', async () => {
    await expect(verifier.verify('google', await token(), nonce)).resolves.toEqual({
      provider: 'google',
      subject: '1234567890',
      verifiedEmail: 'Camille@Example.test',
      emailAuthoritative: false,
    });
  });

  it.each<[string, Record<string, unknown>, boolean]>([
    ['adresse Gmail', { email: 'camille@gmail.com' }, true],
    ['adresse Googlemail (casse libre)', { email: 'camille@GoogleMail.com' }, true],
    ['compte Workspace (`hd`)', { hd: 'example.test' }, true],
    ['adresse tierce', {}, false],
    ['faux Gmail en sous-domaine', { email: 'camille@gmail.com.evil.example' }, false],
    ['`hd` vide', { hd: '' }, false],
  ])('Google fait autorité sur l’adresse : %s → %s', async (_label, claims, expected) => {
    const jwt = await token({
      claims: { email: 'camille@example.test', email_verified: true, ...claims },
    });
    await expect(verifier.verify('google', jwt, nonce)).resolves.toMatchObject({
      emailAuthoritative: expected,
    });
  });

  it('accepte tous les identifiants de client configurés et l’émetteur Google sans schéma', async () => {
    const claims = {
      aud: 'app.depenseo.web',
      email_verified: 'true',
      email: 'x@privaterelay.appleid.com',
    };
    const jwt = await token({ provider: 'apple', signer: apple, claims });
    await expect(verifier.verify('apple', jwt, nonce)).resolves.toMatchObject({
      verifiedEmail: 'x@privaterelay.appleid.com',
      emailAuthoritative: true,
    });
    const legacy = await token({ claims: { iss: 'accounts.google.com' } });
    await expect(verifier.verify('google', legacy, nonce)).resolves.toBeDefined();
  });

  it('n’atteste pas une adresse non vérifiée', async () => {
    const jwt = await token({ claims: { email: 'a@example.test', email_verified: 'false' } });
    await expect(verifier.verify('google', jwt, nonce)).resolves.toEqual({
      provider: 'google',
      subject: '1234567890',
      emailAuthoritative: false,
    });
  });

  it.each<[string, () => Promise<string>, string?]>([
    ['signature d’une clé hors JWKS', async () => token({ key: await foreignKey() })],
    ['jeton Apple présenté comme Google', () => token({ provider: 'apple', signer: apple })],
    ['émetteur inconnu', () => token({ claims: { iss: 'https://evil.example' } })],
    [
      'clé Google, iss et aud Apple, présenté à Google',
      () => token({ claims: { iss: ISSUERS.apple, aud: AUDIENCES.apple } }),
    ],
    ['audience d’une autre application', () => token({ claims: { aud: 'autre.app' } })],
    ['audience Apple présentée à Google', () => token({ claims: { aud: AUDIENCES.apple } })],
    ['expiré (exp = maintenant − tolérance)', () => token({ ttl: -CLOCK_TOLERANCE_S })],
    [
      'émis il y a plus de 10 min, encore valide',
      () => token({ claims: ageClaims(-MAX_TOKEN_AGE_S - CLOCK_TOLERANCE_S - 1, 3600) }),
    ],
    ['émis dans le futur', () => token({ claims: ageClaims(CLOCK_TOLERANCE_S + 1, 3600) })],
    ['nonce d’une autre requête', () => token({ nonce: rawNonce() })],
    ['nonce brut au lieu de son empreinte', () => token({ claims: { nonce } })],
    ['sans nonce', () => token({ claims: { nonce: undefined } })],
    ['sans sub', () => token({ sub: '', claims: { sub: undefined } })],
    ['sub trop long', () => token({ sub: 's'.repeat(256) })],
    [
      'HS256 signé avec un secret',
      () =>
        new SignJWT({
          iss: ISSUERS.google,
          aud: AUDIENCES.google,
          sub: '1',
          nonce: hashedNonce(nonce),
        })
          .setProtectedHeader({ alg: 'HS256', kid: 'google-1' })
          .setIssuedAt(clock.now())
          .setExpirationTime(new Date(clock.now().getTime() + 600_000))
          .sign(new TextEncoder().encode('secret-secret-secret-secret-secret')),
    ],
    ['non signé (alg none)', async () => unsigned(await token())],
    ['illisible', () => Promise.resolve('pas.un.jwt')],
  ])('refuse : %s', async (_label, make) => {
    await expect(verifier.verify('google', await make(), nonce)).rejects.toBeInstanceOf(
      InvalidIdTokenError,
    );
  });

  it('accepte jusqu’à exp + tolérance − 1 s', async () => {
    const jwt = await token({ ttl: 60 });
    const late = (60 + CLOCK_TOLERANCE_S - 1) * 1000;
    clock.advance(late);
    try {
      await expect(verifier.verify('google', jwt, nonce)).resolves.toBeDefined();
      clock.advance(1_000);
      await expect(verifier.verify('google', jwt, nonce)).rejects.toBeInstanceOf(
        InvalidIdTokenError,
      );
    } finally {
      clock.advance(-late - 1_000);
    }
  });

  it('accepte un jeton émis il y a 10 min (tolérance comprise)', async () => {
    const jwt = await token({ claims: ageClaims(-MAX_TOKEN_AGE_S - CLOCK_TOLERANCE_S, 3600) });
    await expect(verifier.verify('google', jwt, nonce)).resolves.toBeDefined();
  });

  it('fournisseur sans identifiant de client configuré → ProviderUnavailableError', async () => {
    const appleOnly = new JoseIdTokenVerifier(
      providerSettings({ ...config, GOOGLE_CLIENT_IDS: [] }, { apple: apple.keys }),
      clock,
    );
    await expect(appleOnly.verify('google', await token(), nonce)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('refuse un algorithme autre que RS256 même si la clé publiée ne fixe pas `alg`', async () => {
    // KeyObject Node : non liée à un hash, contrairement à une CryptoKey WebCrypto.
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'nu-1', use: 'sig' };
    const lax = new JoseIdTokenVerifier(
      {
        google: {
          issuers: [ISSUERS.google],
          audiences: [AUDIENCES.google],
          keys: createLocalJWKSet({ keys: [jwk] }),
        },
      },
      clock,
    );
    const sign = (alg: string) =>
      new SignJWT({
        iss: ISSUERS.google,
        aud: AUDIENCES.google,
        sub: '1',
        nonce: hashedNonce(nonce),
      })
        .setProtectedHeader({ alg, kid: 'nu-1' })
        .setIssuedAt(clock.now())
        .setExpirationTime(new Date(clock.now().getTime() + 600_000))
        .sign(privateKey);
    await expect(lax.verify('google', await sign('RS256'), nonce)).resolves.toBeDefined();
    await expect(lax.verify('google', await sign('RS512'), nonce)).rejects.toBeInstanceOf(
      InvalidIdTokenError,
    );
  });

  /** `iat` décalé de `iatOffset` s par rapport à maintenant, `exp` à `expOffset` s. */
  function ageClaims(iatOffset: number, expOffset: number) {
    const now = Math.floor(clock.now().getTime() / 1000);
    return { iat: now + iatOffset, exp: now + expOffset };
  }

  it.each([
    ['délai dépassé', () => new errors.JWKSTimeout()],
    ['réponse illisible', () => new errors.JWKSInvalid()],
  ])('JWKS en panne (%s) : erreur serveur, pas un refus du jeton', async (_label, failure) => {
    const down = new JoseIdTokenVerifier(
      {
        google: {
          issuers: [ISSUERS.google],
          audiences: [AUDIENCES.google],
          keys: () => Promise.reject(failure()),
        },
      },
      clock,
    );
    await expect(down.verify('google', await token(), nonce)).rejects.not.toBeInstanceOf(
      InvalidIdTokenError,
    );
  });
});

/** Remplace l'en-tête par `alg: none` et retire la signature. */
function unsigned(jwt: string): string {
  const [, payload] = jwt.split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  return `${header}.${payload}.`;
}
