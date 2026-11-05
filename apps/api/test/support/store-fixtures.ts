// Outils des suites d'adaptateurs de stores (P5-01) : clés de test, horloge, serveurs locaux
// fermés après chaque test, JWS au format Apple.
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterEach } from 'vitest';
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

/** JWS au format Apple (le contenu seul est lu ; chaîne x5c vérifiée en P5-02). */
export const jws = (payload: object) =>
  new SignJWT({ ...payload }).setProtectedHeader({ alg: 'ES256' }).sign(ec.privateKey);
