// Heures de rappel locales (F-REC-04, F-NOT-02, ADR-034). Une heure `HH:MM` est interprétée dans le
// fuseau du compte : heure inexistante (passage à l'heure d'été) → décalée d'autant (02:30 → 03:30),
// heure ambiguë (retour à l'heure d'hiver) → la première (désambiguïsation `compatible`).
// Un rappel part au premier passage cron qui suit son instant, au plus `REMINDER_CATCH_UP_MS` après :
// au-delà (cron interrompu), il est abandonné plutôt qu'envoyé à contretemps.
import { z } from 'zod';
import { Temporal } from 'temporal-polyfill';

export const DEFAULT_REMINDER_TIME = '09:00';
export const REMINDER_CATCH_UP_MS = 60 * 60 * 1000;

/** Heure locale `HH:MM` (00:00 à 23:59) ; motif repris tel quel par le contrat OpenAPI. */
export const LOCAL_TIME_PATTERN = '^([01][0-9]|2[0-3]):[0-5][0-9]$';
export const localTime = z
  .string()
  .regex(new RegExp(LOCAL_TIME_PATTERN), 'Heure HH:MM attendue (00:00 à 23:59)');

/** Instant de l'heure `time` du jour `date` dans `timeZone`. */
export function localInstant(date: string, time: string, timeZone: string): Temporal.Instant {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' })
    .toInstant();
}

/** Vrai si `at` est atteint à `now` et date de moins de `REMINDER_CATCH_UP_MS`. */
export function reminderDue(at: Temporal.Instant, now: Temporal.Instant): boolean {
  const late = now.epochMilliseconds - at.epochMilliseconds;
  return late >= 0 && late < REMINDER_CATCH_UP_MS;
}
