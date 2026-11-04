// Validation des corps de requête des catégories (F-CAT-02, ADR-023). Objets stricts : une clé
// inconnue (`systemKey`, `position`…) → 400.
import { z } from 'zod';
import { isUuid } from '../db/uuid.js';

/** UUID v7 généré par le client (§8.2) : version 7, variante RFC 9562 (`10xx`). */
const uuidV7 = z
  .string()
  .refine((v) => isUuid(v) && v[14] === '7' && '89abAB'.includes(v[19]!), 'UUID v7 attendu');
const uuid = z.string().refine(isUuid, 'UUID attendu');
const name = z.string().trim().min(1).max(100);
/** Emoji (une graphie composée peut dépasser 10 unités UTF-16) ou court nom d'icône. */
const icon = z.string().trim().min(1).max(32);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur #RRGGBB attendue')
  .transform((v) => v.toUpperCase());

export const createCategorySchema = z.strictObject({
  id: uuidV7,
  name,
  icon,
  color,
  parentId: uuid.nullable().optional(),
});
export type CreateCategory = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .strictObject({
    name: name.optional(),
    icon: icon.optional(),
    color: color.optional(),
    parentId: uuid.nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Aucun champ à modifier',
  });
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
