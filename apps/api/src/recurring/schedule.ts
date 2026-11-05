// Calendrier des dépenses récurrentes (F-REC-01, ADR-032). Le « jour » de la récurrence est celui
// de sa date de départ : jour de semaine (hebdomadaire) ou jour du mois (mensuel, trimestriel,
// annuel). La n-ième échéance se calcule **depuis la date de départ** (départ + n × pas), jamais
// depuis l'échéance précédente : un 31 janvier donne 28 février puis 31 mars, pas 28 mars.
// Repli en fin de mois par `overflow: 'constrain'` de Temporal (ADR-012). Dates calendaires pures,
// sans fuseau.
import { Temporal } from 'temporal-polyfill';
import type { RecurrenceFrequency } from '../db/schema/index.js';

export interface Schedule {
  frequency: RecurrenceFrequency;
  /** Première échéance, AAAA-MM-JJ. */
  startDate: string;
}

const MONTHS: Record<Exclude<RecurrenceFrequency, 'weekly' | 'once'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** n-ième échéance (n ≥ 0). */
function nth(schedule: Schedule, start: Temporal.PlainDate, n: number): Temporal.PlainDate {
  if (schedule.frequency === 'weekly') return start.add({ days: 7 * n });
  if (schedule.frequency === 'once') return start;
  return start.add({ months: MONTHS[schedule.frequency] * n }, { overflow: 'constrain' });
}

/** Rang de la première échéance susceptible d'être ≥ `from` (estimation par défaut, jamais trop haute). */
function firstRank(schedule: Schedule, start: Temporal.PlainDate, from: Temporal.PlainDate) {
  if (schedule.frequency === 'once' || Temporal.PlainDate.compare(from, start) <= 0) return 0;
  if (schedule.frequency === 'weekly') return Math.floor(start.until(from).days / 7);
  const months = (from.year - start.year) * 12 + (from.month - start.month);
  return Math.max(0, Math.floor(months / MONTHS[schedule.frequency]) - 1);
}

/** Échéances comprises dans [`from`, `through`] (bornes incluses), dans l'ordre, au plus `max`. */
export function dueDates(
  schedule: Schedule,
  from: string,
  through: string,
  max = Number.POSITIVE_INFINITY,
): string[] {
  const start = Temporal.PlainDate.from(schedule.startDate);
  const lower = Temporal.PlainDate.from(from);
  const upper = Temporal.PlainDate.from(through);
  const dates: string[] = [];
  for (let n = firstRank(schedule, start, lower); dates.length < max; n++) {
    const date = nth(schedule, start, n);
    if (Temporal.PlainDate.compare(date, upper) > 0) break;
    if (Temporal.PlainDate.compare(date, lower) >= 0) dates.push(date.toString());
    if (schedule.frequency === 'once') break;
  }
  return dates;
}

/** Première échéance ≥ `from`, `undefined` si la récurrence est épuisée (ponctuelle passée). */
export function nextDueDate(schedule: Schedule, from: string): string | undefined {
  return dueDates(schedule, from, '9999-12-31', 1)[0];
}
