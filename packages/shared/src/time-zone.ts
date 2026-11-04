// Fuseau horaire IANA de l'utilisateur (NF-FMT-04, ADR-022). Les périodes et « aujourd'hui » sont
// calculés dans ce fuseau : un identifiant douteux fausserait tous les totaux.
import { Temporal } from 'temporal-polyfill';

/** Longueur de la colonne `user.time_zone`. */
export const TIME_ZONE_MAX_LENGTH = 64;

/**
 * Forme `Zone/Lieu[/Sous-lieu]` ou `UTC`, casse libre. Écarte les décalages fixes (`+01:00`), que
 * Temporal et Intl acceptent mais qui ignorent les changements d'heure, et les abréviations (`CET`).
 */
const IANA_SHAPE = /^(?:UTC|[A-Z]+(?:\/[A-Z0-9_+-]+)+)$/i;
/** Décalages fixes de la zone `Etc` (`Etc/GMT+4`), sans changement d'heure. */
const ETC_OFFSET = /^Etc\/GMT[+-]\d+$/i;

const isAccepted = (zone: string) =>
  zone.length <= TIME_ZONE_MAX_LENGTH && IANA_SHAPE.test(zone) && !ETC_OFFSET.test(zone);

/**
 * Identifiant IANA reconnu, casse exacte (`europe/paris` → `Europe/Paris`), ou `undefined` s'il est
 * inconnu ou refusé. Un alias est conservé (`America/Montreal` ne devient pas `America/Toronto`,
 * comme le ferait `Intl…resolvedOptions()` selon la version d'ICU) : Temporal normalise la casse
 * sans canonicaliser.
 */
export function normalizeTimeZone(value: string): string | undefined {
  if (!isAccepted(value)) return undefined;
  let id: string;
  try {
    id = Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value).timeZoneId;
  } catch {
    return undefined;
  }
  return isAccepted(id) ? id : undefined;
}
