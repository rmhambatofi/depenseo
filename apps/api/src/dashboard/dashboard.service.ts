// Tableau de bord d'un carnet (F-TB-01/02, ADR-031) : jauge de la période en cours, dernières
// dépenses, répartition par catégorie racine, cumul comparé à la période précédente et évolution
// sur 12 périodes. « Aujourd'hui » dans le fuseau du compte qui consulte ; chaque requête filtre
// par `notebook_id`.
import { Inject, Injectable } from '@nestjs/common';
import { todayIn } from '@depenseo/shared';
import { and, between, eq, isNull, sql } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { category, expense, user } from '../db/schema/index.js';
import { ProblemException } from '../errors/problem.exception.js';
import { type ExpenseView, ExpensesService } from '../expenses/expenses.service.js';
import { dayTotals } from '../limits/day-totals.js';
import { globalLimitVersions } from '../limits/limits.service.js';
import { type PeriodSummary, periodSlices, summarize } from '../limits/period-summary.js';
import {
  type CategoryShare,
  type CategoryTotal,
  categoryBreakdown,
  type CumulativePoint,
  cumulativeByDay,
} from './dashboard.js';

/** Périodes de l'évolution, en cours comprise (F-TB-02). */
export const EVOLUTION_PERIODS = 12;
/** Dernières dépenses affichées (ADR-031). */
export const RECENT_EXPENSES = 5;

export interface DashboardView {
  timeZone: string;
  today: string;
  /** Jauge de la période en cours ; `limit` NULL = total dépensé sans limite. */
  gauge: PeriodSummary;
  /** Dernières dépenses actives, par date puis identifiant décroissants. */
  recent: ExpenseView[];
  /** Répartition de la période en cours par catégorie racine. */
  categories: CategoryShare[];
  /** Cumul de la période en cours (jusqu'à aujourd'hui) et de la précédente (entière). */
  cumulative: { current: CumulativePoint[]; previous: CumulativePoint[] };
  /** Douze périodes, la plus récente (en cours) d'abord. */
  evolution: PeriodSummary[];
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly expenses: ExpensesService,
  ) {}

  async get(notebookId: string, userId: string): Promise<DashboardView> {
    const now = Temporal.Instant.fromEpochMilliseconds(this.clock.now().getTime());
    const [account] = await this.db
      .select({ timeZone: user.timeZone, currency: user.currency })
      .from(user)
      .where(eq(user.id, userId));
    if (!account) throw new ProblemException(401, 'Compte introuvable');
    const today = todayIn(account.timeZone, now).toString();
    const versions = await globalLimitVersions(this.db, notebookId);
    const slices = periodSlices(versions, today, EVOLUTION_PERIODS);
    const [current, previous] = [slices[0]!, slices[1]!];
    const totals = await dayTotals(this.db, notebookId, slices.at(-1)!.start, current.end);
    const evolution = slices.map((s) => summarize(s, today, totals, account.currency));
    const byCategory = await this.categoryTotals(notebookId, current.start, current.end);
    const { items: recent } = await this.expenses.search(notebookId, { limit: RECENT_EXPENSES });
    return {
      timeZone: account.timeZone,
      today,
      gauge: evolution[0]!,
      recent,
      categories: categoryBreakdown(current, byCategory, account.currency),
      cumulative: {
        current: cumulativeByDay(current, today, totals, account.currency),
        previous: cumulativeByDay(previous, today, totals, account.currency),
      },
      evolution,
    };
  }

  /** Sommes de la période par catégorie racine, origine et devise (dépenses actives). */
  private async categoryTotals(
    notebookId: string,
    from: string,
    to: string,
  ): Promise<CategoryTotal[]> {
    const root = sql<string>`coalesce(${category.parentId}, ${category.id})`.mapWith(category.id);
    const rows = await this.db
      .select({
        categoryId: root,
        source: expense.source,
        currency: expense.currency,
        total: sql<string>`cast(sum(${expense.amount}) as char)`,
      })
      .from(expense)
      .innerJoin(category, eq(category.id, expense.categoryId))
      .where(
        and(
          eq(expense.notebookId, notebookId),
          eq(category.notebookId, notebookId),
          isNull(expense.deletedAt),
          between(expense.spentOn, from, to),
        ),
      )
      .groupBy(root, expense.source, expense.currency);
    return rows.map((r) => ({ ...r, total: BigInt(r.total) }));
  }
}
