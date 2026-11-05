// Chiffrement des fichiers servis par l'API (NF-SEC-01, §8.1 : AES-256-GCM).
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptFile, encryptFile, FileDecryptionError } from '../../src/exports/file-crypto.js';

const key = randomBytes(32);
const plain = Buffer.from('Date;Montant\r\n2026-02-03;1234,56\r\n', 'utf8');

describe('encryptFile / decryptFile', () => {
  it('rend le contenu d’origine avec la bonne clé et le bon identifiant', () => {
    const sealed = encryptFile(key, 'export-1', plain);
    expect(decryptFile(key, 'export-1', sealed)).toEqual(plain);
  });

  it('ne laisse rien du clair dans le fichier, et deux chiffrements diffèrent (IV aléatoire)', () => {
    const a = encryptFile(key, 'export-1', plain);
    const b = encryptFile(key, 'export-1', plain);
    expect(a.includes(Buffer.from('1234,56'))).toBe(false);
    expect(a.includes(Buffer.from('Montant'))).toBe(false);
    expect(a.equals(b)).toBe(false);
  });

  it('refuse une autre clé, un autre identifiant (fichier échangé) ou un octet modifié', () => {
    const sealed = encryptFile(key, 'export-1', plain);
    expect(() => decryptFile(randomBytes(32), 'export-1', sealed)).toThrow(FileDecryptionError);
    expect(() => decryptFile(key, 'export-2', sealed)).toThrow(FileDecryptionError);
    for (const index of [0, 5, 20, sealed.length - 1]) {
      const tampered = Buffer.from(sealed);
      tampered[index] = tampered[index]! ^ 0x01;
      expect(() => decryptFile(key, 'export-1', tampered)).toThrow(FileDecryptionError);
    }
    expect(() => decryptFile(key, 'export-1', sealed.subarray(0, 10))).toThrow(FileDecryptionError);
  });

  it('exige une clé de 256 bits', () => {
    expect(() => encryptFile(randomBytes(16), 'export-1', plain)).toThrow(RangeError);
  });
});
