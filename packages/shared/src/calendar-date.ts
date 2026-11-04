// Date calendaire AAAA-MM-JJ sans heure ni fuseau (NF-FMT-02, ADR-002).
// Ne jamais la passer à `new Date(…)` : elle serait lue comme minuit UTC.

declare const calendarDateBrand: unique symbol;
/** Chaîne AAAA-MM-JJ d'un jour existant du calendrier grégorien, années 1000–9999 (plage SQL DATE). */
export type CalendarDate = string & { readonly [calendarDateBrand]: true };

const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isCalendarDate(value: string): value is CalendarDate {
  const match = FORMAT.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  return y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function asCalendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) throw new RangeError(`Date calendaire invalide : « ${value} »`);
  return value;
}
