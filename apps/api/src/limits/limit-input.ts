// Validation des corps de requête de la limite globale (F-LIM-01/02/05, ADR-027). Objets stricts :
// `effectiveDate`, `currency`, `categoryId` ne sont pas fournis par le client (clé inconnue → 400).
import { z } from 'zod';
import { LIMIT_PERIOD_KINDS } from '../db/schema/index.js';
import { uuidV7 } from '../http/uuid-schemas.js';

/** Même borne que le montant d'une dépense (ADR-024). */
export const MAX_LIMIT_AMOUNT = 99_999_999_999;

const amount = z.number().int().min(1).max(MAX_LIMIT_AMOUNT).nullable();
const periodKind = z.enum(LIMIT_PERIOD_KINDS);
const startDay = z.number().int().min(1).max(31);
const includeRecurring = z.boolean();

/** Jour de début compatible avec le type de période : mois 1–31, semaine ISO 1–7. */
export function validStartDay(kind: (typeof LIMIT_PERIOD_KINDS)[number], day: number): boolean {
  return day >= 1 && day <= (kind === 'month' ? 31 : 7);
}

export const createLimitSchema = z
  .strictObject({
    id: uuidV7,
    /** NULL = « aucune limite » à partir d'aujourd'hui (suppression, l'historique reste). */
    amount,
    periodKind: periodKind.default('month'),
    startDay: startDay.default(1),
    includeRecurring: includeRecurring.default(true),
  })
  .refine((v) => validStartDay(v.periodKind, v.startDay), {
    message: 'Jour de début invalide : 1–31 pour un mois, 1–7 (lundi = 1) pour une semaine',
    path: ['startDay'],
  });
export type CreateLimit = z.infer<typeof createLimitSchema>;

export const updateLimitSchema = z
  .strictObject({
    amount: amount.optional(),
    periodKind: periodKind.optional(),
    startDay: startDay.optional(),
    includeRecurring: includeRecurring.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Aucun champ à modifier',
  });
export type UpdateLimit = z.infer<typeof updateLimitSchema>;

/** Nombre maximal de périodes passées par appel (tableau de bord : 12, ADR-028). */
export const MAX_PAST_PERIODS = 24;

/** `GET …/limits/current?past=N` : chiffres seuls, objet strict. */
export const currentLimitQuerySchema = z.strictObject({
  past: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().max(MAX_PAST_PERIODS))
    .default(0),
});
