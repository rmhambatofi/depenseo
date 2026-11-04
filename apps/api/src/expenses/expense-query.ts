// Paramètres de la liste des dépenses (F-DEP-09, ADR-025). Objet strict : un paramètre inconnu ou
// répété à tort → 400. Les nombres arrivent en chaînes : chiffres seuls, jamais `Number('1e3')`.
import { isCalendarDate } from '@depenseo/shared';
import { z } from 'zod';
import { isUuid } from '../db/uuid.js';
import { uuid } from '../http/uuid-schemas.js';
import { MAX_EXPENSE_AMOUNT } from './expense-input.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const SEARCH_MAX_LENGTH = 100;
export const MAX_CATEGORY_FILTERS = 50;

/** Position après la dernière dépense d'une page : clé de tri (date, id). */
export interface ExpenseCursor {
  date: string;
  id: string;
}

/** Curseur opaque : base64url de `AAAA-MM-JJ~uuid`. */
export function encodeCursor({ date, id }: ExpenseCursor): string {
  return Buffer.from(`${date}~${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(value: string): ExpenseCursor | undefined {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) return undefined;
  const [date, id, ...rest] = Buffer.from(value, 'base64url').toString('utf8').split('~');
  if (rest.length > 0 || !date || !id || !isCalendarDate(date) || !isUuid(id)) return undefined;
  return { date, id: id.toLowerCase() };
}

const digits = (max: number) =>
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .pipe(z.number().int().max(max));
const date = z.string().refine(isCalendarDate, 'Date AAAA-MM-JJ attendue');

export const expenseSearchSchema = z
  .strictObject({
    /** Texte cherché dans la note et le marchand ; vide après retrait des espaces = pas de filtre. */
    q: z
      .string()
      .trim()
      .max(SEARCH_MAX_LENGTH)
      .transform((v) => (v === '' ? undefined : v.normalize('NFC')))
      .optional(),
    minAmount: digits(MAX_EXPENSE_AMOUNT).optional(),
    maxAmount: digits(MAX_EXPENSE_AMOUNT).optional(),
    /** Une ou plusieurs catégories (paramètre répété), exactement celles-ci. */
    categoryId: z
      .union([uuid, z.array(uuid).min(1).max(MAX_CATEGORY_FILTERS)])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .optional(),
    from: date.optional(),
    to: date.optional(),
    limit: digits(MAX_PAGE_SIZE).pipe(z.number().min(1)).default(DEFAULT_PAGE_SIZE),
    cursor: z
      .string()
      .transform((v, ctx) => {
        const cursor = decodeCursor(v);
        if (!cursor) ctx.addIssue({ code: 'custom', message: 'Curseur invalide' });
        return cursor ?? z.NEVER;
      })
      .optional(),
  })
  .superRefine((q, ctx) => {
    if (q.minAmount !== undefined && q.maxAmount !== undefined && q.minAmount > q.maxAmount) {
      ctx.addIssue({ code: 'custom', path: ['minAmount'], message: 'minAmount > maxAmount' });
    }
    if (q.from !== undefined && q.to !== undefined && q.from > q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from > to' });
    }
  });
export type ExpenseSearch = z.infer<typeof expenseSearchSchema>;
