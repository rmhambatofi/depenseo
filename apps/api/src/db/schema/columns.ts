// Colonnes communes du schéma (§8.2, NF-FMT-03, ADR-015).
import { customType, datetime } from 'drizzle-orm/mysql-core';
import { uuidBinary } from '../uuid.js';

/** Clé primaire UUID v7 en BINARY(16), générée côté client ou par `newId()`. */
export const primaryId = () => uuidBinary('id').primaryKey();

/** Horodatage UTC à la milliseconde : DATETIME(3), jamais TIMESTAMP (fuseau de session). */
export const utcDateTime = (name: string) => datetime(name, { mode: 'date', fsp: 3 });

/** `created_at` / `updated_at` fournis par l'application (horloge injectable), jamais par le serveur. */
export const timestamps = () => ({
  createdAt: utcDateTime('created_at').notNull(),
  updatedAt: utcDateTime('updated_at').notNull(),
});

/**
 * Empreinte SHA-256 brute en BINARY(32), lue en `Buffer`. Le `binary()` de Drizzle convertit les
 * octets en chaîne UTF-8 (perte d'information) : ne pas l'utiliser.
 */
export const sha256Binary = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'binary(32)',
  toDriver: (value) => {
    if (value.length !== 32) throw new TypeError('Empreinte SHA-256 de taille invalide');
    return value;
  },
  fromDriver: (value) => Buffer.from(value),
});
