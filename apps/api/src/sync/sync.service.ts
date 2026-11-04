// Synchronisation différentielle d'un carnet (NF-OFF-01, §8.2, ADR-026). Un parcours sert
// catégories, étiquettes, dépenses puis versions de limite, chaque table par (updated_at, id) croissants sur l'index
// (notebook_id, updated_at, id), suppressions logiques comprises. Toute requête filtre par
// `notebook_id`.
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, or, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { category, expense, type LimitPeriodKind, spendingLimit, tag } from '../db/schema/index.js';
import { ProblemException } from '../errors/problem.exception.js';
import { tagNamesByExpense } from '../expenses/expense-tags.js';
import { encodeSyncCursor, type SyncCursor, type SyncQuery, SYNC_TABLES } from './sync-query.js';

/** Marge du filigrane : rattrape une écriture validée après son horodatage (ADR-026). */
export const SYNC_WATERMARK_LAG_MS = 5 * 60_000;
/** Ancienneté maximale de `updated_since` : un jour sous la rétention des suppressions (30 j). */
export const SYNC_MAX_AGE_MS = 29 * 24 * 3_600_000;

interface Synced {
  id: string;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface SyncCategory extends Synced {
  parentId: string | null;
  systemKey: string | null;
  name: string;
  icon: string;
  color: string;
  position: number;
  hidden: boolean;
  createdAt: Date;
}
export interface SyncTag extends Synced {
  name: string;
}
export interface SyncExpense extends Synced {
  amount: number;
  currency: string;
  categoryId: string;
  date: string;
  note: string | null;
  merchant: string | null;
  tags: string[];
  source: string;
  createdAt: Date;
}
export interface SyncLimit extends Synced {
  amount: number | null;
  currency: string;
  periodKind: LimitPeriodKind;
  startDay: number;
  includeRecurring: boolean;
  effectiveDate: string;
  createdAt: Date;
}
export interface SyncPage {
  categories: SyncCategory[];
  tags: SyncTag[];
  expenses: SyncExpense[];
  limits: SyncLimit[];
  /** Page suivante du même parcours, `null` à la fin. */
  nextCursor: string | null;
  /** `updated_since` du prochain parcours, une fois celui-ci terminé. */
  nextUpdatedSince: Date;
}

const categoryColumns = {
  id: category.id,
  parentId: category.parentId,
  systemKey: category.systemKey,
  name: category.name,
  icon: category.icon,
  color: category.color,
  position: category.position,
  hidden: category.hidden,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
  deletedAt: category.deletedAt,
};
const tagColumns = {
  id: tag.id,
  name: tag.name,
  updatedAt: tag.updatedAt,
  deletedAt: tag.deletedAt,
};
const expenseColumns = {
  id: expense.id,
  amount: expense.amount,
  currency: expense.currency,
  categoryId: expense.categoryId,
  date: expense.spentOn,
  note: expense.note,
  merchant: expense.merchant,
  source: expense.source,
  createdAt: expense.createdAt,
  updatedAt: expense.updatedAt,
  deletedAt: expense.deletedAt,
};
const limitColumns = {
  id: spendingLimit.id,
  amount: spendingLimit.amount,
  currency: spendingLimit.currency,
  periodKind: spendingLimit.periodKind,
  startDay: spendingLimit.startDay,
  includeRecurring: spendingLimit.includeRecurring,
  effectiveDate: spendingLimit.effectiveDate,
  createdAt: spendingLimit.createdAt,
  updatedAt: spendingLimit.updatedAt,
  deletedAt: spendingLimit.deletedAt,
};

@Injectable()
export class SyncService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async changes(notebookId: string, query: SyncQuery): Promise<SyncPage> {
    const now = this.clock.now();
    const since = query.cursor ? query.cursor.since : query.updated_since;
    if (!query.cursor && since && since.getTime() < now.getTime() - SYNC_MAX_AGE_MS) {
      throw new ProblemException(
        410,
        'Changements trop anciens (suppressions purgées) : refaire une synchronisation complète',
      );
    }
    const watermark = query.cursor?.watermark ?? new Date(now.getTime() - SYNC_WATERMARK_LAG_MS);
    const page: SyncPage = {
      categories: [],
      tags: [],
      expenses: [],
      limits: [],
      nextCursor: null,
      nextUpdatedSince: watermark,
    };
    let remaining = query.limit;
    for (let table = query.cursor?.table ?? 0; table < SYNC_TABLES.length; table++) {
      const after = query.cursor?.table === table ? query.cursor.after : undefined;
      const rows = await this.read(table, notebookId, { since, after }, remaining + 1);
      const kept = rows.slice(0, remaining);
      remaining -= kept.length;
      await this.append(page, table, kept);
      const next = (c: Omit<SyncCursor, 'since' | 'watermark'>) =>
        encodeSyncCursor({ ...c, since, watermark });
      const last = kept.at(-1);
      if (rows.length > kept.length && last) {
        page.nextCursor = next({ table, after: { updatedAt: last.updatedAt, id: last.id } });
        break;
      }
      if (remaining === 0 && table + 1 < SYNC_TABLES.length) {
        page.nextCursor = next({ table: table + 1 });
        break;
      }
    }
    return page;
  }

  private read(
    table: number,
    notebookId: string,
    from: { since?: Date; after?: SyncCursor['after'] },
    limit: number,
  ): Promise<Synced[]> {
    const source = [category, tag, expense, spendingLimit][table]!;
    const conditions: (SQL | undefined)[] = [eq(source.notebookId, notebookId)];
    if (from.after) {
      const { updatedAt, id } = from.after;
      conditions.push(
        or(
          gt(source.updatedAt, updatedAt),
          and(eq(source.updatedAt, updatedAt), gt(source.id, id)),
        ),
      );
    } else if (from.since) {
      conditions.push(gte(source.updatedAt, from.since));
    }
    const columns = [categoryColumns, tagColumns, expenseColumns, limitColumns][table]!;
    return this.db
      .select(columns)
      .from(source)
      .where(and(...conditions))
      .orderBy(asc(source.updatedAt), asc(source.id))
      .limit(limit);
  }

  private async append(page: SyncPage, table: number, rows: Synced[]) {
    switch (SYNC_TABLES[table]) {
      case 'categories':
        page.categories = rows as SyncCategory[];
        return;
      case 'tags':
        page.tags = rows as SyncTag[];
        return;
      case 'expenses': {
        const expenses = rows as Omit<SyncExpense, 'tags'>[];
        const tags = await tagNamesByExpense(
          this.db,
          expenses.map((e) => e.id),
        );
        page.expenses = expenses.map((e) => ({ ...e, tags: tags.get(e.id) ?? [] }));
        return;
      }
      case 'limits':
        page.limits = rows as SyncLimit[];
    }
  }
}
