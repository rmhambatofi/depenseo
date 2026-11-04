// Faux fournisseurs Apple / Google : paires de clés RS256 locales, JWKS et `id_token` signés (jose).
import { createHash, randomBytes } from 'node:crypto';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';
import type { IdentityProvider } from '../../src/db/schema/index.js';
import { TEST_ENV } from './app.js';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export const ISSUERS: Record<IdentityProvider, string> = {
  apple: 'https://appleid.apple.com',
  google: 'https://accounts.google.com',
};

export const AUDIENCES: Record<IdentityProvider, string> = {
  apple: TEST_ENV.APPLE_CLIENT_IDS.split(',')[0]!.trim(),
  google: TEST_ENV.GOOGLE_CLIENT_IDS,
};

export interface FakeProvider {
  kid: string;
  privateKey: PrivateKey;
  keys: JWTVerifyGetKey;
}

export async function fakeProvider(kid: string): Promise<FakeProvider> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { kid, privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
}

/** Clé hors JWKS (attaquant), publiée sous un `kid` choisi. */
export async function foreignKey(): Promise<PrivateKey> {
  return (await generateKeyPair('RS256')).privateKey;
}

export function rawNonce(): string {
  return randomBytes(24).toString('base64url');
}

export function hashedNonce(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface TokenOptions {
  provider: IdentityProvider;
  signer: FakeProvider;
  now: Date;
  nonce: string;
  sub: string;
  /** Claims ajoutés ou remplacés ; `undefined` retire le claim. */
  claims?: JWTPayload;
  key?: PrivateKey;
  /** Durée de validité en secondes (10 min par défaut). */
  ttl?: number;
}

export async function signIdToken(options: TokenOptions): Promise<string> {
  const iat = Math.floor(options.now.getTime() / 1000);
  const payload: JWTPayload = {
    iss: ISSUERS[options.provider],
    aud: AUDIENCES[options.provider],
    sub: options.sub,
    iat,
    exp: iat + (options.ttl ?? 600),
    nonce: hashedNonce(options.nonce),
    ...options.claims,
  };
  for (const [name, value] of Object.entries(payload)) {
    if (value === undefined) delete payload[name];
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: options.signer.kid })
    .sign(options.key ?? options.signer.privateKey);
}
