// Historique des limites (F-LIM-09, ADR-027) : à partir de quel jour chaque version s'applique,
// et quelle version est en vigueur à une date donnée. Une période terminée n'est jamais réécrite :
// une version s'applique dès le début de la période **en cours** à sa date d'effet (selon ses règles
// et celles de la version précédente), jamais avant. Calcul en dates calendaires pures
// (NF-FMT-02, ADR-012).
import { type PeriodRule, periodContaining } from '@depenseo/shared';
import { Temporal } from 'temporal-polyfill';
import type { LimitPeriodKind } from '../db/schema/index.js';

export interface LimitVersion {
  /** AAAA-MM-JJ. */
  effectiveDate: string;
  periodKind: LimitPeriodKind;
  startDay: number;
}

export function periodRule(v: Pick<LimitVersion, 'periodKind' | 'startDay'>): PeriodRule {
  return v.periodKind === 'month'
    ? { kind: 'month', startDay: v.startDay }
    : { kind: 'week', startDay: v.startDay };
}

const startOf = (date: string, v: LimitVersion) =>
  periodContaining(Temporal.PlainDate.from(date), periodRule(v)).start.toString();

const latest = (...dates: string[]) => dates.reduce((a, b) => (b > a ? b : a));

/**
 * Premier jour couvert par chaque version (AAAA-MM-JJ), versions triées par date d'effet
 * croissante. Pour une version de date d'effet `e` :
 * - début de sa propre période contenant `e` (changer le montant en cours de mois vaut pour tout
 *   le mois en cours) ;
 * - mais jamais avant le début de la période de la version précédente contenant `e`, ni avant le
 *   premier jour de la version précédente : si les règles changent (mois → semaine, jour de
 *   début), les périodes déjà terminées gardent leur limite.
 */
export function withAppliesFrom<T extends LimitVersion>(
  versions: readonly T[],
): Array<T & { appliesFrom: string }> {
  const sorted = [...versions].sort((a, b) =>
    a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0,
  );
  const result: Array<T & { appliesFrom: string }> = [];
  for (const v of sorted) {
    const own = startOf(v.effectiveDate, v);
    const previous = result.at(-1);
    const appliesFrom = previous
      ? latest(own, startOf(v.effectiveDate, previous), previous.appliesFrom)
      : own;
    result.push({ ...v, appliesFrom });
  }
  return result;
}

/**
 * Version en vigueur à la date `date` (AAAA-MM-JJ) : la plus récente dont le premier jour couvert
 * est au plus tard `date`. `undefined` avant la première version. Une version dont `amount` est
 * NULL signifie « aucune limite ».
 */
export function versionInForce<T extends LimitVersion>(
  versions: readonly T[],
  date: string,
): (T & { appliesFrom: string }) | undefined {
  return withAppliesFrom(versions)
    .filter((v) => v.appliesFrom <= date)
    .at(-1);
}
