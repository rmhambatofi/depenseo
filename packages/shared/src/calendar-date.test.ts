import { describe, expect, it } from 'vitest';
import { asCalendarDate, isCalendarDate } from './calendar-date.js';

describe('CalendarDate (AAAA-MM-JJ, NF-FMT-02)', () => {
  it.each([
    '2026-11-03',
    '1000-01-01',
    '9999-12-31',
    '2024-02-29',
    '2000-02-29',
    '1999-12-31',
    '2026-01-01',
  ])('accepte %s', (s) => {
    expect(isCalendarDate(s)).toBe(true);
    expect(asCalendarDate(s)).toBe(s);
  });

  it.each([
    '0999-12-31', // hors plage SQL DATE
    '0000-01-01',
    '2026-02-29', // année non bissextile
    '1900-02-29', // séculaire non bissextile
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-1-03',
    '26-11-03',
    '2026/11/03',
    '2026-11-03T00:00:00Z',
    ' 2026-11-03',
    '',
  ])('rejette « %s »', (s) => {
    expect(isCalendarDate(s)).toBe(false);
    expect(() => asCalendarDate(s)).toThrow(RangeError);
  });
});
