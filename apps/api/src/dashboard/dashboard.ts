// Calculs purs du tableau de bord (F-TB-01/02, ADR-031) : cumul jour par jour d'une période et
// répartition par catégorie racine, selon les mêmes règles de comptage que la jauge (ADR-028).
// Dates calendaires seulement ; « aujourd'hui » est fourni par l'appelant (fuseau du compte).
import { Temporal } from 'temporal-polyfill';
import type { ExpenseSource } from '../db/schema/index.js';
import { type DayTotal, type PeriodSlice, safe, sliceScope } from '../limits/period-summary.js';

export interface CumulativePoint {
  /** Rang du jour dans la période, à partir de 1 : axe commun avec la période précédente. */
  day: number;
  date: string;
  /** Total cumulé du premier jour à `date` inclus, unités mineures de la devise de la période. */
  cumulative: number;
}

/**
 * Cumul jour par jour de `slice.start` à `min(slice.end, lastDay)` (un point par jour, jours sans
 * dépense compris) ; vide si la période commence après `lastDay`.
 */
export function cumulativeByDay(
  slice: PeriodSlice,
  lastDay: string,
  totals: readonly DayTotal[],
  accountCurrency: string,
): CumulativePoint[] {
  const { currency, covers } = sliceScope(slice, accountCurrency);
  const byDay = new Map<string, bigint>();
  for (const t of totals) {
    if (!covers(t) || t.currency !== currency) continue;
    byDay.set(t.spentOn, (byDay.get(t.spentOn) ?? 0n) + t.total);
  }
  const end = slice.end < lastDay ? slice.end : lastDay;
  const points: CumulativePoint[] = [];
  let running = 0n;
  for (
    let date = Temporal.PlainDate.from(slice.start);
    date.toString() <= end;
    date = date.add({ days: 1 })
  ) {
    const iso = date.toString();
    running += byDay.get(iso) ?? 0n;
    points.push({ day: points.length + 1, date: iso, cumulative: safe(running) });
  }
  return points;
}

/** Somme des dépenses d'une période par catégorie racine, origine et devise. */
export interface CategoryTotal {
  /** Catégorie racine (la catégorie elle-même si elle n'a pas de parent). */
  categoryId: string;
  source: ExpenseSource;
  currency: string;
  total: bigint;
}

export interface CategoryShare {
  categoryId: string;
  total: number;
  /** ⌊100 × total / total de la période⌋. */
  percent: number;
}

/**
 * Répartition par catégorie racine de la période (devise et récurrences comme la jauge : la somme
 * des parts égale `spent`), par total décroissant puis identifiant. `totals` couvre la période.
 */
export function categoryBreakdown(
  slice: PeriodSlice,
  totals: readonly CategoryTotal[],
  accountCurrency: string,
): CategoryShare[] {
  const { currency, includeRecurring } = sliceScope(slice, accountCurrency);
  const byCategory = new Map<string, bigint>();
  for (const t of totals) {
    if (t.currency !== currency || (!includeRecurring && t.source === 'recurrence')) continue;
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0n) + t.total);
  }
  const sum = [...byCategory.values()].reduce((a, b) => a + b, 0n);
  return [...byCategory]
    .sort(([idA, a], [idB, b]) => (a === b ? (idA < idB ? -1 : 1) : a > b ? -1 : 1))
    .map(([categoryId, total]) => ({
      categoryId,
      total: safe(total),
      percent: safe((total * 100n) / sum),
    }));
}
