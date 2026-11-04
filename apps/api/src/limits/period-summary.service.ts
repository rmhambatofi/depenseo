// Jauge de la limite globale (F-LIM-03/05, NF-FMT-04, ADR-028) : période en cours et périodes
// passées, « aujourd'hui » dans le fuseau du compte qui consulte. Toute requête filtre par
// `notebook_id` ; une seule agrégation SQL couvre toutes les périodes demandées.
import { Inject, Injectable } from '@nestjs/common';
import { todayIn } from '@depenseo/shared';
import { eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { user } from '../db/schema/index.js';
import { ProblemException } from '../errors/problem.exception.js';
import { dayTotals } from './day-totals.js';
import { globalLimitVersions } from './limits.service.js';
import { type PeriodSummary, periodSlices, summarize } from './period-summary.js';

export interface CurrentLimitView {
  /** Fuseau du compte qui consulte : il fixe « aujourd'hui ». */
  timeZone: string;
  today: string;
  current: PeriodSummary;
  /** Périodes précédentes, la plus récente d'abord. */
  past: PeriodSummary[];
}

@Injectable()
export class PeriodSummaryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async current(notebookId: string, userId: string, past: number): Promise<CurrentLimitView> {
    const now = Temporal.Instant.fromEpochMilliseconds(this.clock.now().getTime());
    const [account] = await this.db
      .select({ timeZone: user.timeZone, currency: user.currency })
      .from(user)
      .where(eq(user.id, userId));
    if (!account) throw new ProblemException(401, 'Compte introuvable');
    const today = todayIn(account.timeZone, now).toString();
    const versions = await globalLimitVersions(this.db, notebookId);
    const slices = periodSlices(versions, today, past + 1);
    const totals = await dayTotals(this.db, notebookId, slices.at(-1)!.start, slices[0]!.end);
    const [current, ...previous] = slices.map((s) => summarize(s, today, totals, account.currency));
    return { timeZone: account.timeZone, today, current: current!, past: previous };
  }
}
