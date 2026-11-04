// Identifiants UUID v7 (§8.2) : texte côté application et API, BINARY(16) en base.
// Octets dans l'ordre du texte (pas d'échange à la UUID_TO_BIN(…, 1)) : v7 est déjà trié par date.
import { customType } from 'drizzle-orm/mysql-core';
import { v7 } from 'uuid';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nouvel identifiant (serveur) ; les clients mobiles génèrent les leurs. */
export function newId(): string {
  return v7();
}

export function uuidToBinary(id: string): Buffer {
  if (!UUID_PATTERN.test(id)) throw new TypeError('Identifiant UUID mal formé');
  return Buffer.from(id.replaceAll('-', ''), 'hex');
}

export function binaryToUuid(bin: Uint8Array): string {
  if (bin.length !== 16) throw new TypeError('Identifiant binaire de taille invalide');
  const hex = Buffer.from(bin).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Colonne Drizzle `BINARY(16)` exposée en chaîne UUID. */
export const uuidBinary = customType<{ data: string; driverData: Buffer }>({
  dataType: () => 'binary(16)',
  toDriver: uuidToBinary,
  fromDriver: binaryToUuid,
});
