// Schémas zod d'identifiants communs aux corps de requête.
import { z } from 'zod';
import { isUuid } from '../db/uuid.js';

/** UUID v7 généré par le client (§8.2) : version 7, variante RFC 9562 (`10xx`). */
export const uuidV7 = z
  .string()
  .refine((v) => isUuid(v) && v[14] === '7' && '89abAB'.includes(v[19]!), 'UUID v7 attendu');

export const uuid = z.string().refine(isUuid, 'UUID attendu');
