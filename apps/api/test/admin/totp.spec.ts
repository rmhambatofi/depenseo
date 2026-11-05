// TOTP RFC 6238 (SHA-1, 6 chiffres, 30 s) : vecteurs de l'annexe B tronqués à 6 chiffres.
import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  verifyTotp,
} from '../../src/admin/totp.js';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const at = (seconds: number) => new Date(seconds * 1000);

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('code à T=%i : %s', (seconds, code) => {
    expect(totpCode(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
  });

  it('base32 aller-retour, sans bourrage, insensible à la casse et aux espaces', () => {
    const bytes = Buffer.from('12345678901234567890', 'ascii');
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET.toLowerCase().replace(/(.{4})/g, '$1 '))).toEqual(bytes);
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Decode('MY')).toEqual(Buffer.from('f'));
    expect(() => base32Decode('M1')).toThrow();
  });

  it('secret aléatoire de 160 bits', () => {
    const a = generateTotpSecret();
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(generateTotpSecret());
  });

  it('accepte le pas courant et ±1 pas, renvoie le pas utilisé', () => {
    const now = at(1111111109); // pas 37037036
    expect(verifyTotp(RFC_SECRET, '081804', now)).toBe(37037036);
    expect(verifyTotp(RFC_SECRET, '081804', at(1111111109 + 30))).toBe(37037036);
    expect(verifyTotp(RFC_SECRET, '081804', at(1111111109 - 30))).toBe(37037036);
  });

  it('refuse hors fenêtre, mauvais code ou format invalide', () => {
    expect(verifyTotp(RFC_SECRET, '081804', at(1111111109 + 60))).toBeUndefined();
    expect(verifyTotp(RFC_SECRET, '081804', at(1111111109 - 60))).toBeUndefined();
    expect(verifyTotp(RFC_SECRET, '081805', at(1111111109))).toBeUndefined();
    for (const bad of ['', '81804', '0818040', '08180a', ' 081804', '０８１８０４']) {
      expect(verifyTotp(RFC_SECRET, bad, at(1111111109))).toBeUndefined();
    }
  });

  it('URI otpauth pour l’application d’authentification', () => {
    const uri = new URL(otpauthUri(RFC_SECRET, 'admin@example.test'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/Depenseo:admin@example.test');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: RFC_SECRET,
      issuer: 'Depenseo',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});
