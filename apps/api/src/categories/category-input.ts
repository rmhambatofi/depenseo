// Validation des corps de requête des catégories (F-CAT-02, ADR-023). Objets stricts : une clé
// inconnue (`systemKey`, `position`…) → 400.
import { z } from 'zod';
import { uuid, uuidV7 } from '../http/uuid-schemas.js';

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
