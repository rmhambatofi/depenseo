// Vérification des JWS Apple (ADR-041) : chaîne x5c jusqu'à la racine de confiance, OID Apple,
// validité, signature. PKI de test : `test/fixtures/apple-pki` (chaîne `rogue` = autre racine).
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  APPLE_ROOT_CA_G3,
  AppleSignedDataVerifier,
  InvalidSignedDataError,
} from '../../src/subscriptions/apple-signed-data.js';
import { FakeClock } from '../support/clock.js';
import {
  APPLE_TEST_ROOT,
  appleChain,
  appleSignedData,
  ec,
  jws,
} from '../support/store-fixtures.js';

const rejects = (value: unknown, verifier = appleSignedData) =>
  expect(verifier.verify(value)).rejects.toBeInstanceOf(InvalidSignedDataError);

describe('AppleSignedDataVerifier', () => {
  it('chaîne de confiance : contenu rendu', async () => {
    expect(await appleSignedData.verify(await jws({ notificationType: 'DID_RENEW' }))).toEqual({
      notificationType: 'DID_RENEW',
    });
  });

  it('racine Apple Root CA - G3 embarquée (empreinte publiée par Apple)', () => {
    expect(new X509Certificate(APPLE_ROOT_CA_G3).fingerprint256).toBe(
      '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
    );
  });

  it('chaîne d’une autre racine → refus', async () => {
    await rejects(await jws({ a: 1 }, 'rogue'));
  });

  it('racine de confiance annoncée mais intermédiaire pirate → refus', async () => {
    const [leaf, intermediate] = appleChain('rogue');
    const [, , root] = appleChain('trusted');
    await rejects(await jws({ a: 1 }, 'rogue', [leaf!, intermediate!, root!]));
  });

  it('feuille de confiance mais JWS signé par une autre clé → refus', async () => {
    const forged = await new SignJWT({ a: 1 })
      .setProtectedHeader({ alg: 'ES256', x5c: appleChain('trusted') })
      .sign(ec.privateKey);
    await rejects(forged);
  });

  it('contenu altéré après signature → refus', async () => {
    const [header, , signature] = (await jws({ status: 'expired' })).split('.');
    const body = Buffer.from(JSON.stringify({ status: 'active' })).toString('base64url');
    await rejects(`${header}.${body}.${signature}`);
  });

  it('sans x5c, x5c incomplet, alg différent ou non-chaîne → refus', async () => {
    await rejects(
      await new SignJWT({ a: 1 }).setProtectedHeader({ alg: 'ES256' }).sign(ec.privateKey),
    );
    await rejects(await jws({ a: 1 }, 'trusted', appleChain('trusted').slice(0, 2)));
    await rejects('pas-un-jws');
    await rejects(42);
  });

  it('feuille sans l’OID de signature StoreKit (même intermédiaire) → refus', async () => {
    const pem = (n: string) =>
      readFileSync(new URL(`../fixtures/apple-pki/${n}`, import.meta.url), 'utf8');
    const [, intermediate, root] = appleChain('trusted');
    const plain = new X509Certificate(pem('trusted-plain.pem')).raw.toString('base64');
    const signed = await new SignJWT({ a: 1 })
      .setProtectedHeader({ alg: 'ES256', x5c: [plain, intermediate!, root!] })
      .sign(createPrivateKey(pem('trusted-plain.key')));
    await rejects(signed);
  });

  it('certificats hors de leur période de validité → refus', async () => {
    const leaf = new X509Certificate(
      readFileSync(new URL('../fixtures/apple-pki/trusted-leaf.pem', import.meta.url)),
    );
    const before = new AppleSignedDataVerifier(
      [APPLE_TEST_ROOT],
      new FakeClock(Date.parse(leaf.validFrom) - 1000),
    );
    await rejects(await jws({ a: 1 }), before);
    const after = new AppleSignedDataVerifier(
      [APPLE_TEST_ROOT],
      new FakeClock(Date.parse(leaf.validTo) + 1000),
    );
    await rejects(await jws({ a: 1 }), after);
  });

  it('feuille présentée comme intermédiaire (non émettrice) → refus', async () => {
    const [leaf, , root] = appleChain('trusted');
    await rejects(await jws({ a: 1 }, 'trusted', [leaf!, leaf!, root!]));
  });
});
