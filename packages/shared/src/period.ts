// Périodes de limite (F-LIM-02) et « aujourd'hui » dans le fuseau de l'utilisateur (NF-FMT-04).
// Tout calcul se fait en Temporal.PlainDate, sans heure ni fuseau (NF-FMT-02, ADR-002) ;
// le repli des jours de début 29–31 sur la fin de mois est décrit dans ADR-012.
import { Temporal } from 'temporal-polyfill';
import { asCalendarDate, type CalendarDate } from './calendar-date.js';

export type PeriodRule =
  /** startDay : jour du mois 1–31, ramené au dernier jour des mois plus courts. */
  | { readonly kind: 'month'; readonly startDay: number }
  /** startDay : jour ISO 1 = lundi … 7 = dimanche ; lundi par défaut. */
  | { readonly kind: 'week'; readonly startDay?: number };

/** Période inclusive [start, end]. */
export interface Period {
  readonly start: Temporal.PlainDate;
  readonly end: Temporal.PlainDate;
}

function checkDay(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${label} invalide : ${String(value)} (attendu 1–${String(max)})`);
  }
}

/** Début de période dans le mois de `ym` : le jour `startDay`, ou le dernier jour du mois s'il n'existe pas. */
function monthStart(ym: Temporal.PlainYearMonth, startDay: number): Temporal.PlainDate {
  return ym.toPlainDate({ day: Math.min(startDay, ym.daysInMonth) });
}

function startOfPeriod(date: Temporal.PlainDate, rule: PeriodRule): Temporal.PlainDate {
  if (rule.kind === 'week') {
    const startDay = rule.startDay ?? 1;
    checkDay(startDay, 7, 'Jour de début de semaine');
    return date.subtract({ days: (date.dayOfWeek - startDay + 7) % 7 });
  }
  checkDay(rule.startDay, 31, 'Jour de début de mois');
  const ym = date.toPlainYearMonth();
  const candidate = monthStart(ym, rule.startDay);
  return Temporal.PlainDate.compare(date, candidate) >= 0
    ? candidate
    : monthStart(ym.subtract({ months: 1 }), rule.startDay);
}

function startOfNext(start: Temporal.PlainDate, rule: PeriodRule): Temporal.PlainDate {
  if (rule.kind === 'week') return start.add({ days: 7 });
  return monthStart(start.toPlainYearMonth().add({ months: 1 }), rule.startDay);
}

/** Période de la règle qui contient `date`. */
export function periodContaining(date: Temporal.PlainDate, rule: PeriodRule): Period {
  const start = startOfPeriod(date, rule);
  return { start, end: startOfNext(start, rule).subtract({ days: 1 }) };
}

export function nextPeriod(period: Period, rule: PeriodRule): Period {
  return periodContaining(period.end.add({ days: 1 }), rule);
}

export function previousPeriod(period: Period, rule: PeriodRule): Period {
  return periodContaining(period.start.subtract({ days: 1 }), rule);
}

/** Date calendaire locale de `instant` dans le fuseau IANA `timeZone` ; RangeError si fuseau inconnu. */
export function todayIn(timeZone: string, instant: Temporal.Instant): Temporal.PlainDate {
  return instant.toZonedDateTimeISO(timeZone).toPlainDate();
}

export function toPlainDate(date: CalendarDate): Temporal.PlainDate {
  return Temporal.PlainDate.from(date, { overflow: 'reject' });
}

export function toCalendarDate(date: Temporal.PlainDate): CalendarDate {
  return asCalendarDate(date.toString());
}
