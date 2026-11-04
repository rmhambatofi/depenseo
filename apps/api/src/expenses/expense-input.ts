// Validation des corps de requête des dépenses (F-DEP-03, NF-FMT-01/02, ADR-024). Objets stricts :
// une clé inconnue (`source`, `paymentMethod`…) → 400. `source` est fixé par le serveur.
import { isCalendarDate, isCurrencyCode } from '@depenseo/shared';
import { z } from 'zod';
import { uuid, uuidV7 } from '../http/uuid-schemas.js';

/** Plafond d'une dépense : 999 999 999,99 dans une devise à 2 décimales (entier sûr en JS). */
export const MAX_EXPENSE_AMOUNT = 99_999_999_999;
export const MAX_TAGS_PER_EXPENSE = 10;
export const NOTE_MAX_LENGTH = 500;
export const MERCHANT_MAX_LENGTH = 100;
export const TAG_MAX_LENGTH = 50;

/** Centimes : entier JSON strictement positif (ni chaîne, ni décimal). */
const amount = z.number().int().positive().max(MAX_EXPENSE_AMOUNT);
const currency = z.string().refine(isCurrencyCode, 'Devise ISO 4217 prise en charge attendue');
const date = z.string().refine(isCalendarDate, 'Date AAAA-MM-JJ attendue');
/** Texte libre facultatif : espaces retirés, chaîne vide → NULL, forme NFC. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v.normalize('NFC')))
    .nullable()
    .optional();
/** Noms en NFC : la collation ne rapproche pas toujours une forme décomposée (`e` + ◌́). */
const tags = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(TAG_MAX_LENGTH)
      .transform((v) => v.normalize('NFC')),
  )
  .max(MAX_TAGS_PER_EXPENSE);

export const createExpenseSchema = z.strictObject({
  id: uuidV7,
  amount,
  currency: currency.optional(),
  categoryId: uuid,
  date,
  note: optionalText(NOTE_MAX_LENGTH),
  merchant: optionalText(MERCHANT_MAX_LENGTH),
  tags: tags.optional(),
});
export type CreateExpense = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z
  .strictObject({
    amount: amount.optional(),
    currency: currency.optional(),
    categoryId: uuid.optional(),
    date: date.optional(),
    note: optionalText(NOTE_MAX_LENGTH),
    merchant: optionalText(MERCHANT_MAX_LENGTH),
    tags: tags.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Aucun champ à modifier',
  });
export type UpdateExpense = z.infer<typeof updateExpenseSchema>;
