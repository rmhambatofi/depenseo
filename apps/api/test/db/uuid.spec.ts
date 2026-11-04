import { describe, expect, it } from 'vitest';
import { binaryToUuid, newId, uuidToBinary } from '../../src/db/uuid.js';

describe('UUID v7 ↔ BINARY(16)', () => {
  it('génère des UUID v7 croissants', () => {
    const ids = Array.from({ length: 50 }, () => newId());
    expect(
      ids.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
      ),
    ).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('convertit sans perte dans les deux sens, octets dans l’ordre du texte', () => {
    const id = '0190a6e2-7b3c-7d4e-8f00-0123456789ab';
    const bin = uuidToBinary(id);
    expect(bin).toBeInstanceOf(Buffer);
    expect(bin.toString('hex')).toBe('0190a6e27b3c7d4e8f000123456789ab');
    expect(binaryToUuid(bin)).toBe(id);
  });

  it('normalise les majuscules en minuscules', () => {
    expect(binaryToUuid(uuidToBinary('0190A6E2-7B3C-7D4E-8F00-0123456789AB'))).toBe(
      '0190a6e2-7b3c-7d4e-8f00-0123456789ab',
    );
  });

  it('refuse un identifiant mal formé ou un binaire de mauvaise taille', () => {
    expect(() => uuidToBinary('pas-un-uuid')).toThrow(TypeError);
    expect(() => uuidToBinary('0190a6e27b3c7d4e8f000123456789ab')).toThrow(TypeError);
    expect(() => binaryToUuid(Buffer.alloc(15))).toThrow(TypeError);
  });
});
