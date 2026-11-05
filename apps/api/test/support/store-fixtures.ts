// Outils des suites d'adaptateurs de stores (P5-01) : clés de test, horloge, serveurs locaux
// fermés après chaque test, JWS au format Apple signés par la PKI de test (`test/fixtures/apple-pki`).
import { createPrivateKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';
import { afterEach } from 'vitest';
import { AppleSignedDataVerifier } from '../../src/subscriptions/apple-signed-data.js';
import { FakeClock } from './clock.js';
import { type LocalServer, localServer, type ReceivedRequest } from './local-server.js';

export const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
export const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const pkcs8 = (k: typeof ec.privateKey) =>
  k.export({ type: 'pkcs8', format: 'pem' }).toString();
export const spki = (k: typeof ec.publicKey) =>
  k.export({ type: 'spki', format: 'pem' }).toString();

export const clock = new FakeClock(Date.UTC(2027, 7, 20, 9, 0, 0));
export const NOW = clock.now().getTime();
export const DAY = 86_400_000;
export const BUNDLE = 'app.depenseo.ios';
export const PACKAGE = 'app.depenseo.android';
export const ISSUER = '57246542-96fe-1a63-e053-0824d011072a';

let servers: LocalServer[] = [];

/** À appeler au niveau du fichier de test : ferme les serveurs ouverts par `serve`. */
export function closeServersAfterEach(): void {
  afterEach(async () => {
    await Promise.all(servers.map((s) => s.close()));
    servers = [];
  });
}

export async function serve(reply: (r: ReceivedRequest) => { status: number; body?: object }) {
  const server = await localServer(reply);
  servers.push(server);
  return server;
}

const pki = (name: string) =>
  readFileSync(new URL(`../fixtures/apple-pki/${name}`, import.meta.url), 'utf8');
export type ApplePki = 'trusted' | 'rogue';
/** Racine de confiance des tests (la chaîne `rogue` a la même forme, signée par une autre racine). */
export const APPLE_TEST_ROOT = pki('trusted-root.pem');
const der = (pem: string) => new X509Certificate(pem).raw.toString('base64');
export const appleChain = (chain: ApplePki) =>
  ['leaf', 'intermediate', 'root'].map((c) => der(pki(`${chain}-${c}.pem`)));
export const appleSignedData = new AppleSignedDataVerifier([APPLE_TEST_ROOT], clock);

/** JWS au format Apple : ES256, en-tête `x5c` [feuille, intermédiaire, racine] de la PKI choisie. */
export const jws = (payload: object, chain: ApplePki = 'trusted', x5c = appleChain(chain)) =>
  new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'ES256', x5c })
    .sign(createPrivateKey(pki(`${chain}-leaf.key`)));
