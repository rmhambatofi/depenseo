// Validation des corps de requête des dépenses récurrentes et des échéances (F-REC-01/03, ADR-032).
// Objets stricts : la fréquence et la date de départ sont immuables (clé inconnue au PATCH → 400) ;
// pour changer de calendrier, supprimer la récurrence et en créer une autre.
import { isCalendarDate, isCurrencyCode } from '@depenseo/shared';
import { z } from 'zod';
import { AMOUNT_KINDS, RECURRENCE_FREQUENCIES, RECURRENCE_MODES } from '../db/schema/index.js';
import { MAX_EXPENSE_AMOUNT } from '../expenses/expense-input.js';
import { uuid, uuidV7 } from '../http/uuid-schemas.js';

export const NAME_MAX_LENGTH = 100;

const amount = z.number().int().positive().max(MAX_EXPENSE_AMOUNT);
const date = z.string().refine(isCalendarDate, 'Date AAAA-MM-JJ attendue');
const name = z
  .string()
  .trim()
  .min(1)
  .max(NAME_MAX_LENGTH)
  .transform((v) => v.normalize('NFC'));
const amountKind = z.enum(AMOUNT_KINDS);
const mode = z.enum(RECURRENCE_MODES);

export const createRecurringSchema = z.strictObject({
  id: uuidV7,
  name,
  amount,
  currency: z
    .string()
    .refine(isCurrencyCode, 'Devise ISO 4217 prise en charge attendue')
    .optional(),
  amountKind: amountKind.default('fixed'),
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  /** Première échéance : porte le jour de la récurrence. */
  startDate: date,
  categoryId: uuid,
  mode: mode.default('confirm'),
});
export type CreateRecurring = z.infer<typeof createRecurringSchema>;

export const updateRecurringSchema = z
  .strictObject({
    name: name.optional(),
    amount: amount.optional(),
    amountKind: amountKind.optional(),
    categoryId: uuid.optional(),
    mode: mode.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Aucun champ à modifier',
  });
export type UpdateRecurring = z.infer<typeof updateRecurringSchema>;

/** Ajustement du montant d'une échéance en attente ; `null` = revenir au montant de la récurrence. */
export const adjustOccurrenceSchema = z.strictObject({ amount: amount.nullable() });
export type AdjustOccurrence = z.infer<typeof adjustOccurrenceSchema>;

/** Paiement : la dépense créée prend l'identifiant client (idempotence hors ligne, §8.2). */
export const payOccurrenceSchema = z.strictObject({
  expenseId: uuidV7,
  /** Montant réel ; défaut : montant ajusté de l'échéance, sinon celui de la récurrence. */
  amount: amount.optional(),
  /** Date de la dépense ; défaut : date d'échéance. */
  date: date.optional(),
});
export type PayOccurrence = z.infer<typeof payOccurrenceSchema>;
