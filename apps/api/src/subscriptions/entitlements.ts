// Droits Premium d'un compte (F-ABO-01/02/03, ADR-009, ADR-040) : seule source de vérité des
// fonctions Premium, dérivée des abonnements vérifiés auprès des stores et de l'essai de 14 jours.
// Les droits suivent le compte, pas l'appareil : tout appareil connecté au compte en profite.
import { todayIn } from '@depenseo/shared';
import { and, eq, gt } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Tx } from '../auth/session.service.js';
import type { Database } from '../db/connection.js';
import { subscription, user } from '../db/schema/index.js';
import { localInstant } from '../notifications/reminder-time.js';
import type { PurchaseStatus } from './store-receipt-verifier.js';

export const TRIAL_DAYS = 14;

export const PLANS = ['free', 'trial', 'premium'] as const;
export type Plan = (typeof PLANS)[number];

export interface EntitlementState {
  plan: Plan;
  /** Fin des droits Premium en cours (abonnement le plus tardif, sinon fin d'essai) ; NULL si gratuit. */
  premiumUntil: Date | null;
  /** Fin de l'essai (passée ou future) ; NULL s'il n'a jamais commencé. */
  trialEndsAt: Date | null;
  /** Vrai tant que l'essai n'a jamais été commencé (une fois par compte). */
  trialAvailable: boolean;
}

/**
 * Fin d'un essai commencé à `start` : minuit, heure locale du compte, au début du jour
 * `TRIAL_DAYS + 1`. Le jour du début compte comme jour 1 ; au jour 15, l'essai est terminé.
 */
export function trialEnd(start: Date, timeZone: string): Date {
  const firstDay = todayIn(timeZone, Temporal.Instant.fromEpochMilliseconds(start.getTime()));
  const endDay = firstDay.add({ days: TRIAL_DAYS }).toString();
  return new Date(localInstant(endDay, '00:00', timeZone).epochMilliseconds);
}

export function resolveEntitlements(
  subscriptions: ReadonlyArray<{ status: PurchaseStatus; expiresAt: Date }>,
  trialEndsAt: Date | null,
  now: Date,
): EntitlementState {
  const paidUntil = subscriptions
    .filter((s) => s.status === 'active' && s.expiresAt > now)
    .reduce<Date | null>((max, s) => (max && max >= s.expiresAt ? max : s.expiresAt), null);
  const trialAvailable = trialEndsAt === null;
  if (paidUntil) return { plan: 'premium', premiumUntil: paidUntil, trialEndsAt, trialAvailable };
  if (trialEndsAt && trialEndsAt > now) {
    return { plan: 'trial', premiumUntil: trialEndsAt, trialEndsAt, trialAvailable };
  }
  return { plan: 'free', premiumUntil: null, trialEndsAt, trialAvailable };
}

/** Droits du compte à `now`, lus dans la transaction (ou la connexion) de l'appelant. */
export async function loadEntitlements(
  db: Database | Tx,
  userId: string,
  now: Date,
): Promise<EntitlementState> {
  const [account] = await db
    .select({ trialEndsAt: user.trialEndsAt })
    .from(user)
    .where(eq(user.id, userId));
  const subscriptions = await db
    .select({ status: subscription.status, expiresAt: subscription.expiresAt })
    .from(subscription)
    .where(and(eq(subscription.userId, userId), gt(subscription.expiresAt, now)));
  return resolveEntitlements(subscriptions, account?.trialEndsAt ?? null, now);
}

/** Export Excel (F-EXP-01, ADR-009) : Premium, essai compris. */
export function canExportExcel(state: EntitlementState): boolean {
  return state.plan !== 'free';
}
