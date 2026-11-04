// Résumé de période (F-LIM-03/05, NF-FMT-04, ADR-028) : découpage des périodes de limite selon
// l'historique des versions (ADR-027) et calcul dépensé / limite / restant / rythme. Calcul pur en
// dates calendaires ; « aujourd'hui » est fourni par l'appelant, dans le fuseau de l'utilisateur.
import { type PeriodRule, periodContaining } from '@depenseo/shared';
import { Temporal } from 'temporal-polyfill';
import type { ExpenseSource, LimitPeriodKind } from '../db/schema/index.js';
import { type LimitVersion, periodRule, withAppliesFrom } from './limit-history.js';

export interface SummaryVersion extends LimitVersion {
  id: string;
  amount: number | null;
  currency: string;
  includeRecurring: boolean;
}

/** Période effective (bornes inclusives, éventuellement tronquée par un changement de règles). */
export interface PeriodSlice<V extends SummaryVersion = SummaryVersion> {
  start: string;
  end: string;
  rule: PeriodRule;
  /** Version en vigueur sur toute la période ; `undefined` avant la première version. */
  version: (V & { appliesFrom: string }) | undefined;
}

/** Somme des dépenses d'un jour, par origine et devise. */
export interface DayTotal {
  spentOn: string;
  source: ExpenseSource;
  currency: string;
  total: bigint;
}

export interface PeriodSummary {
  start: string;
  end: string;
  periodKind: LimitPeriodKind;
  startDay: number;
  limitId: string | null;
  /** Unités mineures de `currency` ; NULL = aucune limite. */
  limit: number | null;
  currency: string;
  includeRecurring: boolean;
  spent: number;
  /** Négatif en cas de dépassement ; NULL sans limite. */
  remaining: number | null;
  /** ⌊100 × dépensé / limite⌋ ; NULL sans limite. */
  consumedPercent: number | null;
  /** Jours écoulés, aujourd'hui compris (tous pour une période passée). */
  elapsedDays: number;
  totalDays: number;
  /** ⌊100 × jours écoulés / jours de la période⌋. */
  elapsedPercent: number;
  /** Devises des dépenses de la période non comptées (multidevise hors MVP). */
  otherCurrencies: string[];
}

/** Règle par défaut, avant toute limite : mois civil (F-LIM-02). */
export const DEFAULT_RULE: PeriodRule = { kind: 'month', startDay: 1 };

const plain = (date: string) => Temporal.PlainDate.from(date);
const dayBefore = (date: string) => plain(date).subtract({ days: 1 }).toString();
const max = (a: string, b: string) => (a > b ? a : b);
const min = (a: string, b: string) => (a < b ? a : b);
const daysBetween = (start: string, end: string) =>
  plain(start).until(plain(end), { largestUnit: 'days' }).days + 1;

/**
 * Période en cours à `today` puis les `count − 1` précédentes, la plus récente d'abord. Chaque
 * période suit la règle de la version en vigueur et s'arrête aux bornes des versions voisines
 * (ADR-027) ; avant la première version, la règle de celle-ci (ou le mois civil) sans limite.
 */
export function periodSlices<V extends SummaryVersion>(
  versions: readonly V[],
  today: string,
  count: number,
): Array<PeriodSlice<V>> {
  const history = withAppliesFrom(versions);
  const sliceAt = (date: string): PeriodSlice<V> => {
    const index = history.findLastIndex((v) => v.appliesFrom <= date);
    const version = index >= 0 ? history[index] : undefined;
    const next = history[index + 1];
    const reference = version ?? history[0];
    const rule = reference ? periodRule(reference) : DEFAULT_RULE;
    const period = periodContaining(plain(date), rule);
    let start = period.start.toString();
    let end = period.end.toString();
    if (version) start = max(start, version.appliesFrom);
    if (next) end = min(end, dayBefore(next.appliesFrom));
    return { start, end, rule, version };
  };
  const slices = [sliceAt(today)];
  while (slices.length < count) slices.push(sliceAt(dayBefore(slices.at(-1)!.start)));
  return slices;
}

function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Total hors de la plage des entiers sûrs');
  }
  return Number(value);
}

/** Résumé d'une période à partir des totaux journaliers (hors période ignorés). */
export function summarize(
  slice: PeriodSlice,
  today: string,
  totals: readonly DayTotal[],
  accountCurrency: string,
): PeriodSummary {
  const { version } = slice;
  const limit = version?.amount ?? null;
  const currency = version?.currency ?? accountCurrency;
  const includeRecurring = version?.includeRecurring ?? true;
  let spent = 0n;
  const others = new Set<string>();
  for (const t of totals) {
    if (t.spentOn < slice.start || t.spentOn > slice.end) continue;
    if (!includeRecurring && t.source === 'recurrence') continue;
    if (t.currency === currency) spent += t.total;
    else others.add(t.currency);
  }
  const totalDays = daysBetween(slice.start, slice.end);
  const elapsedDays = today > slice.end ? totalDays : daysBetween(slice.start, today);
  return {
    start: slice.start,
    end: slice.end,
    periodKind: slice.rule.kind,
    startDay: slice.rule.startDay ?? 1,
    limitId: version?.id ?? null,
    limit,
    currency,
    includeRecurring,
    spent: safe(spent),
    remaining: limit === null ? null : safe(BigInt(limit) - spent),
    consumedPercent: limit === null ? null : safe((spent * 100n) / BigInt(limit)),
    elapsedDays,
    totalDays,
    elapsedPercent: Math.floor((elapsedDays * 100) / totalDays),
    otherCurrencies: [...others].sort(),
  };
}
