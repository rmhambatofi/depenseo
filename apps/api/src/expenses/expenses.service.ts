// Dépenses d'un carnet (F-DEP-03, F-DEP-10, NF-OFF-01, ADR-024). Toute requête filtre par
// `notebook_id` : la garde de carnet ne protège pas une dépense d'un autre carnet désignée par son
// identifiant. Les écritures verrouillent la ligne `notebook` (catégorie supprimée en parallèle,
// étiquettes créées en parallèle, futures alertes de limite).
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { category, expense, expenseTag, tag, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { isUuid, newId } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import type { CreateExpense, UpdateExpense } from './expense-input.js';
import { checkLimitAlert } from '../limits/limit-alerts.js';
import { tagNamesByExpense } from './expense-tags.js';
import { encodeCursor, type ExpenseSearch } from './expense-query.js';

export interface ExpenseView {
  id: string;
  amount: number;
  currency: string;
  categoryId: string;
  date: string;
  note: string | null;
  merchant: string | null;
  /** Noms triés selon la collation de la base. */
  tags: string[];
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpensePage {
  items: ExpenseView[];
  /** Curseur de la page suivante, `null` en fin de liste. */
  nextCursor: string | null;
}

export const EXPENSE_NOT_FOUND = 'Dépense introuvable';
const ID_TAKEN = 'Identifiant de dépense déjà utilisé';
const DELETED = 'Dépense supprimée : la restaurer plutôt que la recréer';
const INVALID_CATEGORY = 'Catégorie invalide : catégorie non supprimée du même carnet attendue';

const columns = {
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
};

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(notebookId: string, id: string): Promise<ExpenseView> {
    const found = await this.find(this.db, notebookId, id);
    if (!found) throw new ProblemException(404, EXPENSE_NOT_FOUND);
    return found;
  }

  /**
   * Liste filtrée des dépenses actives (F-DEP-09, ADR-025), par date puis id décroissants,
   * paginée par curseur (pagination par clé : stable si des dépenses sont ajoutées entre deux
   * pages). Le texte est comparé sous la collation des colonnes (utf8mb4_unicode_520_ci) :
   * insensible à la casse et aux accents.
   */
  async search(notebookId: string, query: ExpenseSearch): Promise<ExpensePage> {
    const conditions: (SQL | undefined)[] = [
      eq(expense.notebookId, notebookId),
      isNull(expense.deletedAt),
    ];
    if (query.q !== undefined) {
      const pattern = `%${query.q.replace(/[!%_]/g, '!$&')}%`;
      conditions.push(
        sql`(${expense.note} like ${pattern} escape '!' or ${expense.merchant} like ${pattern} escape '!')`,
      );
    }
    if (query.minAmount !== undefined) conditions.push(gte(expense.amount, query.minAmount));
    if (query.maxAmount !== undefined) conditions.push(lte(expense.amount, query.maxAmount));
    if (query.categoryId) conditions.push(inArray(expense.categoryId, query.categoryId));
    if (query.from !== undefined) conditions.push(gte(expense.spentOn, query.from));
    if (query.to !== undefined) conditions.push(lte(expense.spentOn, query.to));
    if (query.cursor) {
      const { date, id } = query.cursor;
      conditions.push(
        or(lt(expense.spentOn, date), and(eq(expense.spentOn, date), lt(expense.id, id))),
      );
    }
    const rows = await this.db
      .select(columns)
      .from(expense)
      .where(and(...conditions))
      .orderBy(desc(expense.spentOn), desc(expense.id))
      .limit(query.limit + 1);
    const items = rows.slice(0, query.limit);
    const tags = await tagNamesByExpense(
      this.db,
      items.map((r) => r.id),
    );
    const last = items.at(-1);
    return {
      items: items.map((row) => ({ ...row, tags: tags.get(row.id) ?? [] })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Insertion idempotente par UUID client (§8.2, NF-OFF-01) : un rejeu renvoie la ligne existante
   * sans la modifier (la première écriture gagne). Identifiant pris dans un autre carnet, ou
   * dépense supprimée (à restaurer explicitement) → 409.
   */
  async create(notebookId: string, userId: string, input: CreateExpense): Promise<ExpenseView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const [existing] = await tx
        .select({ notebookId: expense.notebookId, deletedAt: expense.deletedAt })
        .from(expense)
        .where(eq(expense.id, input.id));
      if (existing) {
        if (existing.notebookId !== notebookId) throw new ProblemException(409, ID_TAKEN);
        if (existing.deletedAt !== null) throw new ProblemException(409, DELETED);
        return (await this.find(tx, notebookId, input.id))!;
      }
      await this.assertValidCategory(tx, notebookId, input.categoryId);
      await tx
        .insert(expense)
        .values({
          id: input.id,
          notebookId,
          amount: input.amount,
          currency: input.currency ?? (await this.userCurrency(tx, userId)),
          categoryId: input.categoryId,
          spentOn: input.date,
          note: input.note ?? null,
          merchant: input.merchant ?? null,
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        })
        // Même identifiant inséré au même instant par un autre carnet (verrou distinct) : la clé
        // primaire tranche sans erreur, la relecture filtrée par carnet détecte le conflit.
        .onDuplicateKeyUpdate({ set: { id: sql`${expense.id}` } });
      const [owner] = await tx
        .select({ notebookId: expense.notebookId })
        .from(expense)
        .where(eq(expense.id, input.id));
      if (owner?.notebookId !== notebookId) throw new ProblemException(409, ID_TAKEN);
      if (input.tags?.length) await this.replaceTags(tx, notebookId, input.id, input.tags, now);
      await checkLimitAlert(tx, this.clock, notebookId, userId);
      return (await this.find(tx, notebookId, input.id))!;
    });
  }

  async update(
    notebookId: string,
    userId: string,
    id: string,
    patch: UpdateExpense,
  ): Promise<ExpenseView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      if (!(await this.find(tx, notebookId, id))) {
        throw new ProblemException(404, EXPENSE_NOT_FOUND);
      }
      if (patch.categoryId !== undefined) {
        await this.assertValidCategory(tx, notebookId, patch.categoryId);
      }
      const { date, tags, ...fields } = patch;
      await tx
        .update(expense)
        .set({ ...fields, ...(date === undefined ? {} : { spentOn: date }), updatedAt: now })
        .where(and(eq(expense.id, id), eq(expense.notebookId, notebookId)));
      if (tags !== undefined) await this.replaceTags(tx, notebookId, id, tags, now);
      await checkLimitAlert(tx, this.clock, notebookId, userId);
      return (await this.find(tx, notebookId, id))!;
    });
  }

  /** Suppression logique, idempotente. */
  async remove(notebookId: string, id: string): Promise<void> {
    await this.setDeleted(notebookId, id, { deleted: true });
  }

  /**
   * Annulation d'une suppression (F-DEP-10) ; sans effet sur une dépense active. La catégorie n'est
   * pas revérifiée : supprimée entre-temps, elle reste référencée, comme pour une dépense active.
   */
  async restore(notebookId: string, userId: string, id: string): Promise<ExpenseView> {
    return (await this.setDeleted(notebookId, id, { deleted: false, userId }))!;
  }

  /**
   * Vue de la dépense active après l'opération, `undefined` si elle est supprimée. Une suppression
   * ne fait que baisser le total : seule la restauration relance la détection des alertes.
   */
  private async setDeleted(
    notebookId: string,
    id: string,
    op: { deleted: true } | { deleted: false; userId: string },
  ): Promise<ExpenseView | undefined> {
    const { deleted } = op;
    if (!isUuid(id)) throw new ProblemException(404, EXPENSE_NOT_FOUND);
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const where = and(eq(expense.id, id), eq(expense.notebookId, notebookId));
      const [row] = await tx.select({ deletedAt: expense.deletedAt }).from(expense).where(where);
      if (!row) throw new ProblemException(404, EXPENSE_NOT_FOUND);
      if ((row.deletedAt !== null) !== deleted) {
        await tx
          .update(expense)
          .set({ deletedAt: deleted ? now : null, updatedAt: now })
          .where(where);
        if (!op.deleted) await checkLimitAlert(tx, this.clock, notebookId, op.userId);
      }
      return this.find(tx, notebookId, id);
    });
  }

  private async find(
    tx: Tx | Database,
    notebookId: string,
    id: string,
  ): Promise<ExpenseView | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await tx
      .select(columns)
      .from(expense)
      .where(
        and(eq(expense.id, id), eq(expense.notebookId, notebookId), isNull(expense.deletedAt)),
      );
    if (!row) return undefined;
    const tags = await tagNamesByExpense(tx, [id]);
    return { ...row, tags: tags.get(id) ?? [] };
  }

  /** Catégorie non supprimée du carnet ; masquée acceptée (ADR-023). */
  private async assertValidCategory(tx: Tx, notebookId: string, categoryId: string) {
    const [found] = await tx
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(category.id, categoryId),
          eq(category.notebookId, notebookId),
          isNull(category.deletedAt),
        ),
      );
    if (!found) throw new ProblemException(422, INVALID_CATEGORY);
  }

  private async userCurrency(tx: Tx, userId: string): Promise<string> {
    const [row] = await tx
      .select({ currency: user.currency })
      .from(user)
      .where(eq(user.id, userId));
    return row!.currency;
  }

  /**
   * Remplace les étiquettes d'une dépense. Une étiquette est identifiée par son nom dans le
   * carnet, à la collation près (`Été` = `ete`) : l'index unique `(notebook_id, name)` dédoublonne,
   * le premier nom enregistré fait foi.
   */
  private async replaceTags(
    tx: Tx,
    notebookId: string,
    expenseId: string,
    names: string[],
    now: Date,
  ) {
    await tx.delete(expenseTag).where(eq(expenseTag.expenseId, expenseId));
    if (names.length === 0) return;
    await tx
      .insert(tag)
      .values(
        names.map((name) => ({ id: newId(), notebookId, name, createdAt: now, updatedAt: now })),
      )
      .onDuplicateKeyUpdate({ set: { id: sql`${tag.id}` } });
    const rows = await tx
      .select({ id: tag.id })
      .from(tag)
      .where(and(eq(tag.notebookId, notebookId), inArray(tag.name, names)));
    await tx
      .insert(expenseTag)
      .values(
        [...new Set(rows.map((r) => r.id))].map((tagId) => ({ id: newId(), expenseId, tagId })),
      );
  }
}
