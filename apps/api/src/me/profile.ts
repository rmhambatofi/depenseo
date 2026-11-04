// Préférences modifiables du compte (§8.3, NF-FMT-04, ADR-022). L'adresse, le rôle, le plan et les
// dates de consentement ne passent jamais par ce schéma (objet strict : clé inconnue → 400).
import { isCurrencyCode, normalizeTimeZone } from '@depenseo/shared';
import { z } from 'zod';
import { LANGUAGES } from '../auth/auth.service.js';

export const profilePatchSchema = z
  .strictObject({
    language: z.enum(LANGUAGES).optional(),
    timeZone: z
      .string()
      .transform((value, ctx) => {
        const zone = normalizeTimeZone(value);
        if (zone === undefined) {
          ctx.addIssue({ code: 'custom', message: 'Fuseau IANA inconnu' });
          return z.NEVER;
        }
        return zone;
      })
      .optional(),
    currency: z
      .string()
      .refine((value) => isCurrencyCode(value), 'Devise non prise en charge')
      .optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Aucun champ à modifier',
  });
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
