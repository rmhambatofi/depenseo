// Plage de silence (F-NOT-04, ADR-035) : heures locales `HH:MM` dans le fuseau du compte, début
// inclus, fin exclue, éventuellement à cheval sur minuit (22:00–07:00). Une notification qui tombe
// dans la plage est reportée à sa fin (heure inexistante → décalée, cf. `localInstant`).
import { Temporal } from 'temporal-polyfill';
import { localInstant } from './reminder-time.js';

export interface QuietHours {
  start: string;
  end: string;
}

/** Fin de la plage de silence en cours à `now`, ou `null` hors plage (ou sans plage). */
export function quietHoursEnd(
  now: Temporal.Instant,
  timeZone: string,
  quiet: QuietHours | null,
): Temporal.Instant | null {
  if (!quiet || quiet.start === quiet.end) return null;
  const local = now.toZonedDateTimeISO(timeZone);
  const time = local.toPlainTime().toString({ smallestUnit: 'minute' });
  const today = local.toPlainDate();
  let endDate: Temporal.PlainDate;
  if (quiet.start < quiet.end) {
    if (time < quiet.start || time >= quiet.end) return null;
    endDate = today;
  } else if (time >= quiet.start) {
    endDate = today.add({ days: 1 });
  } else if (time < quiet.end) {
    endDate = today;
  } else {
    return null;
  }
  const endsAt = localInstant(endDate.toString(), quiet.end, timeZone);
  // Fin décalée par un changement d'heure déjà dépassée : hors plage.
  return Temporal.Instant.compare(endsAt, now) > 0 ? endsAt : null;
}
