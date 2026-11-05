// Paramètres des listes du back-office (F-ADM-01, ADR-043) : objets stricts, pagination par
// curseur opaque sur (horodatage décroissant, id décroissant).
import { z } from 'zod';
import { JOB_STATUSES } from '../db/schema/job.js';
import { isUuid } from '../db/uuid.js';
import { uuid } from '../http/uuid-schemas.js';
import { PURCHASE_STATUSES, STORES } from '../subscriptions/store-receipt-verifier.js';

export const ADMIN_DEFAULT_PAGE_SIZE = 50;
export const ADMIN_MAX_PAGE_SIZE = 100;

/** Position après la dernière ligne d'une page. */
export interface AdminCursor {
  at: Date;
  id: string;
}

/** Curseur opaque : base64url de `<millisecondes epoch>~uuid`. */
export function encodeAdminCursor({ at, id }: AdminCursor): string {
  return Buffer.from(`${at.getTime()}~${id}`, 'utf8').toString('base64url');
}

export function decodeAdminCursor(value: string): AdminCursor | undefined {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) return undefined;
  const [ms, id, ...rest] = Buffer.from(value, 'base64url').toString('utf8').split('~');
  if (rest.length > 0 || !ms || !/^\d{1,15}$/.test(ms) || !id || !isUuid(id)) return undefined;
  return { at: new Date(Number(ms)), id: id.toLowerCase() };
}

const page = {
  limit: z
    .string()
    .regex(/^\d{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(ADMIN_MAX_PAGE_SIZE))
    .default(ADMIN_DEFAULT_PAGE_SIZE),
  cursor: z
    .string()
    .transform((value, ctx) => {
      const cursor = decodeAdminCursor(value);
      if (!cursor) ctx.addIssue({ code: 'custom', message: 'Curseur invalide' });
      return cursor ?? z.NEVER;
    })
    .optional(),
};

export const SEARCH_MAX_LENGTH = 100;

export const userListSchema = z.strictObject({
  /** Fragment d'adresse e-mail, insensible à la casse. */
  q: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH)
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  ...page,
});
export type UserListQuery = z.infer<typeof userListSchema>;

export const subscriptionListSchema = z.strictObject({
  userId: uuid.transform((v) => v.toLowerCase()).optional(),
  store: z.enum(STORES).optional(),
  status: z.enum(PURCHASE_STATUSES).optional(),
  ...page,
});
export type SubscriptionListQuery = z.infer<typeof subscriptionListSchema>;

export const jobListSchema = z.strictObject({
  /** Par défaut, les tâches en échec (statut définitif après 5 essais, §8.2). */
  status: z.enum(JOB_STATUSES).default('failed'),
  ...page,
});
export type JobListQuery = z.infer<typeof jobListSchema>;

export const auditListSchema = z.strictObject({
  actorUserId: uuid.transform((v) => v.toLowerCase()).optional(),
  targetId: uuid.transform((v) => v.toLowerCase()).optional(),
  action: z
    .string()
    .regex(/^[a-z_.]{1,64}$/)
    .optional(),
  ...page,
});
export type AuditListQuery = z.infer<typeof auditListSchema>;

export interface AdminPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Découpe `limit + 1` lignes lues en une page et son curseur suivant. */
export function toPage<T, R extends { id: string }>(
  rows: R[],
  limit: number,
  at: (row: R) => Date,
  view: (row: R) => T,
): AdminPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(view),
    nextCursor:
      rows.length > limit && last ? encodeAdminCursor({ at: at(last), id: last.id }) : null,
  };
}
