// Limite globale d'un carnet (F-LIM-01/02/05/09, §8.3, ADR-027). Chaque modification crée une
// version datée du jour (fuseau du compte) ; seule la version du jour se modifie en place, pour que
// les périodes passées gardent la limite de l'époque. Toute requête filtre par `notebook_id`.
import { Inject, Injectable } from '@nestjs/common';
import { todayIn } from '@depenseo/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Tx } from '../auth/session.service.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { type LimitPeriodKind, spendingLimit, user } from '../db/schema/index.js';
import { ER_DUP_ENTRY, hasErrno, withTransaction } from '../db/transaction.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import { withAppliesFrom } from './limit-history.js';
import { type CreateLimit, type UpdateLimit, validStartDay } from './limit-input.js';

export interface LimitView {
  id: string;
  /** NULL = aucune limite à partir de `appliesFrom`. */
  amount: number | null;
  currency: string;
  periodKind: LimitPeriodKind;
  startDay: number;
  includeRecurring: boolean;
  effectiveDate: string;
  /** Premier jour de la première période couverte par cette version. */
  appliesFrom: string;
  createdAt: Date;
  updatedAt: Date;
}

export const LIMIT_NOT_FOUND = 'Limite introuvable';
const ID_TAKEN = 'Identifiant de limite déjà utilisé';
const SAME_DAY = 'Une limite a déjà été définie aujourd’hui : modifier cette version';
const BEFORE_LAST = 'Une version plus récente existe déjà (changement de fuseau) : la modifier';
const PAST_VERSION =
  'Version passée : elle s’applique à des périodes révolues, créer une nouvelle version';

const columns = {
  id: spendingLimit.id,
  amount: spendingLimit.amount,
  currency: spendingLimit.currency,
  periodKind: spendingLimit.periodKind,
  startDay: spendingLimit.startDay,
  includeRecurring: spendingLimit.includeRecurring,
  effectiveDate: spendingLimit.effectiveDate,
  createdAt: spendingLimit.createdAt,
  updatedAt: spendingLimit.updatedAt,
};
type Row = Omit<LimitView, 'appliesFrom'>;

/** Limite globale : pas de catégorie (la clé générée vaut alors 16 octets nuls). */
const isGlobal = isNull(spendingLimit.categoryId);

@Injectable()
export class LimitsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Versions de la limite globale, de la plus récente à la plus ancienne. */
  async list(notebookId: string): Promise<LimitView[]> {
    return (await this.history(this.db, notebookId)).reverse();
  }

  /**
   * Nouvelle version datée du jour du compte. Rejeu du même identifiant → version existante (la
   * première écriture gagne) ; identifiant d'un autre carnet, ou autre version le même jour → 409.
   */
  async create(notebookId: string, userId: string, input: CreateLimit): Promise<LimitView> {
    const now = this.clock.now();
    try {
      return await withTransaction(this.db, async (tx) => {
        await lockNotebook(tx, notebookId);
        const [existing] = await tx
          .select({ notebookId: spendingLimit.notebookId, deletedAt: spendingLimit.deletedAt })
          .from(spendingLimit)
          .where(eq(spendingLimit.id, input.id));
        if (existing) {
          if (existing.notebookId !== notebookId || existing.deletedAt !== null) {
            throw new ProblemException(409, ID_TAKEN);
          }
          return this.view(tx, notebookId, input.id);
        }
        const account = await this.account(tx, userId);
        const effectiveDate = this.today(account.timeZone, now);
        const last = await this.lastEffectiveDate(tx, notebookId);
        if (last === effectiveDate) throw new ProblemException(409, SAME_DAY);
        // Fuseau changé vers l'ouest (ou horloge reculée) : une version antérieure à la dernière
        // réécrirait l'historique (F-LIM-09).
        if (last !== undefined && last > effectiveDate)
          throw new ProblemException(409, BEFORE_LAST);
        await tx.insert(spendingLimit).values({
          id: input.id,
          notebookId,
          periodKind: input.periodKind,
          startDay: input.startDay,
          amount: input.amount,
          currency: account.currency,
          includeRecurring: input.includeRecurring,
          effectiveDate,
          createdAt: now,
          updatedAt: now,
        });
        return this.view(tx, notebookId, input.id);
      });
    } catch (error) {
      // Filet : l'index unique (carnet, clé, date d'effet) tranche une course non sérialisée.
      if (hasErrno(error, ER_DUP_ENTRY)) throw new ProblemException(409, SAME_DAY);
      throw error;
    }
  }

  /** Modifie la version du jour seulement : une version passée appartient à l'historique. */
  async update(
    notebookId: string,
    userId: string,
    id: string,
    patch: UpdateLimit,
  ): Promise<LimitView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const current = await this.find(tx, notebookId, id);
      if (!current) throw new ProblemException(404, LIMIT_NOT_FOUND);
      const account = await this.account(tx, userId);
      if (current.effectiveDate !== this.today(account.timeZone, now)) {
        throw new ProblemException(409, PAST_VERSION);
      }
      const periodKind = patch.periodKind ?? current.periodKind;
      const startDay = patch.startDay ?? current.startDay;
      if (!validStartDay(periodKind, startDay)) {
        throw new ProblemException(400, 'Champs invalides : startDay');
      }
      await tx
        .update(spendingLimit)
        .set({ ...patch, updatedAt: now })
        .where(and(eq(spendingLimit.id, id), eq(spendingLimit.notebookId, notebookId)));
      return this.view(tx, notebookId, id);
    });
  }

  /**
   * Toutes les versions actives, par date d'effet croissante, avec leur premier jour couvert
   * (qui dépend des versions précédentes, ADR-027).
   */
  private async history(tx: Tx | Database, notebookId: string): Promise<LimitView[]> {
    const rows = await tx
      .select(columns)
      .from(spendingLimit)
      .where(
        and(eq(spendingLimit.notebookId, notebookId), isGlobal, isNull(spendingLimit.deletedAt)),
      )
      .orderBy(asc(spendingLimit.effectiveDate));
    return withAppliesFrom(rows);
  }

  private async view(tx: Tx, notebookId: string, id: string): Promise<LimitView> {
    const found = (await this.history(tx, notebookId)).find((v) => v.id === id);
    if (!found) throw new ProblemException(409, ID_TAKEN);
    return found;
  }

  private today(timeZone: string, now: Date): string {
    return todayIn(timeZone, Temporal.Instant.fromEpochMilliseconds(now.getTime())).toString();
  }

  private async account(tx: Tx, userId: string) {
    const [row] = await tx
      .select({ timeZone: user.timeZone, currency: user.currency })
      .from(user)
      .where(eq(user.id, userId));
    if (!row) throw new ProblemException(401, 'Compte introuvable');
    return row;
  }

  /** Date d'effet la plus récente, versions supprimées comprises (elles occupent l'index unique). */
  private async lastEffectiveDate(tx: Tx, notebookId: string): Promise<string | undefined> {
    const [row] = await tx
      .select({ effectiveDate: spendingLimit.effectiveDate })
      .from(spendingLimit)
      .where(and(eq(spendingLimit.notebookId, notebookId), isGlobal))
      .orderBy(desc(spendingLimit.effectiveDate))
      .limit(1);
    return row?.effectiveDate;
  }

  private async find(tx: Tx | Database, notebookId: string, id: string): Promise<Row | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await tx
      .select(columns)
      .from(spendingLimit)
      .where(
        and(
          eq(spendingLimit.id, id),
          eq(spendingLimit.notebookId, notebookId),
          isGlobal,
          isNull(spendingLimit.deletedAt),
        ),
      );
    return row;
  }
}
