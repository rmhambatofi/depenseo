// Dépenses récurrentes d'un carnet (F-REC-01, ADR-032). Toute requête filtre par `notebook_id` ;
// les écritures verrouillent la ligne `notebook` (catégorie supprimée en parallèle). La création
// matérialise les échéances à partir d'aujourd'hui (fuseau du compte) : une date de départ passée
// ne crée pas d'échéances passées.
import { Inject, Injectable } from '@nestjs/common';
import { todayIn } from '@depenseo/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { Tx } from '../auth/session.service.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { category, occurrence, recurringExpense, user } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import { addDays, generateOccurrences, HORIZON_DAYS } from './occurrence-generation.js';
import type { CreateRecurring, UpdateRecurring } from './recurring-input.js';

export const RECURRING_NOT_FOUND = 'Dépense récurrente introuvable';
const ID_TAKEN = 'Identifiant de dépense récurrente déjà utilisé';
const DELETED = 'Dépense récurrente supprimée';
const PAST_ONCE = 'Échéance ponctuelle passée : date d’aujourd’hui ou future attendue';
export const INVALID_CATEGORY =
  'Catégorie invalide : catégorie non supprimée du même carnet attendue';

export const recurringColumns = {
  id: recurringExpense.id,
  name: recurringExpense.name,
  amount: recurringExpense.amount,
  currency: recurringExpense.currency,
  amountKind: recurringExpense.amountKind,
  frequency: recurringExpense.frequency,
  startDate: recurringExpense.startDate,
  categoryId: recurringExpense.categoryId,
  mode: recurringExpense.mode,
  createdAt: recurringExpense.createdAt,
  updatedAt: recurringExpense.updatedAt,
};

export type RecurringView = {
  [K in keyof typeof recurringColumns]: (typeof recurringColumns)[K]['_']['data'];
};

/** Catégorie non supprimée du carnet ; masquée acceptée (ADR-023). */
export async function assertValidCategory(tx: Tx, notebookId: string, categoryId: string) {
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

@Injectable()
export class RecurringService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Récurrences actives, par nom puis identifiant. */
  list(notebookId: string): Promise<RecurringView[]> {
    return this.db
      .select(recurringColumns)
      .from(recurringExpense)
      .where(and(eq(recurringExpense.notebookId, notebookId), isNull(recurringExpense.deletedAt)))
      .orderBy(asc(recurringExpense.name), asc(recurringExpense.id));
  }

  async get(notebookId: string, id: string): Promise<RecurringView> {
    const found = await this.find(this.db, notebookId, id);
    if (!found) throw new ProblemException(404, RECURRING_NOT_FOUND);
    return found;
  }

  /** Insertion idempotente par UUID client : un rejeu renvoie la récurrence existante. */
  async create(notebookId: string, userId: string, input: CreateRecurring): Promise<RecurringView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const [existing] = await tx
        .select({ notebookId: recurringExpense.notebookId, deletedAt: recurringExpense.deletedAt })
        .from(recurringExpense)
        .where(eq(recurringExpense.id, input.id));
      if (existing) {
        if (existing.notebookId !== notebookId) throw new ProblemException(409, ID_TAKEN);
        if (existing.deletedAt !== null) throw new ProblemException(409, DELETED);
        return (await this.find(tx, notebookId, input.id))!;
      }
      await assertValidCategory(tx, notebookId, input.categoryId);
      const [account] = await tx
        .select({ timeZone: user.timeZone, currency: user.currency })
        .from(user)
        .where(eq(user.id, userId));
      const today = todayIn(
        account!.timeZone,
        Temporal.Instant.fromEpochMilliseconds(now.getTime()),
      ).toString();
      if (input.frequency === 'once' && input.startDate < today) {
        throw new ProblemException(422, PAST_ONCE);
      }
      const rec = { ...input, notebookId };
      await tx
        .insert(recurringExpense)
        .values({
          id: input.id,
          notebookId,
          name: input.name,
          amount: input.amount,
          currency: input.currency ?? account!.currency,
          amountKind: input.amountKind,
          frequency: input.frequency,
          startDate: input.startDate,
          categoryId: input.categoryId,
          mode: input.mode,
          generatedThrough: today,
          createdAt: now,
          updatedAt: now,
        })
        // Même identifiant inséré au même instant par un autre carnet (verrou distinct) : la clé
        // primaire tranche sans erreur, la relecture filtrée par carnet détecte le conflit.
        .onDuplicateKeyUpdate({ set: { id: sql`${recurringExpense.id}` } });
      const [owner] = await tx
        .select({ notebookId: recurringExpense.notebookId })
        .from(recurringExpense)
        .where(eq(recurringExpense.id, input.id));
      if (owner?.notebookId !== notebookId) throw new ProblemException(409, ID_TAKEN);
      const from = input.startDate > today ? input.startDate : today;
      const through = await generateOccurrences(tx, rec, from, addDays(today, HORIZON_DAYS), now);
      await tx
        .update(recurringExpense)
        .set({ generatedThrough: through })
        .where(eq(recurringExpense.id, input.id));
      return (await this.find(tx, notebookId, input.id))!;
    });
  }

  /**
   * Nom, montant, nature du montant, catégorie, mode. Les échéances en attente non ajustées
   * suivent le nouveau montant ; les échéances payées gardent celui de leur dépense.
   */
  async update(notebookId: string, id: string, patch: UpdateRecurring): Promise<RecurringView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      if (!(await this.find(tx, notebookId, id))) {
        throw new ProblemException(404, RECURRING_NOT_FOUND);
      }
      if (patch.categoryId !== undefined) {
        await assertValidCategory(tx, notebookId, patch.categoryId);
      }
      await tx
        .update(recurringExpense)
        .set({ ...patch, updatedAt: now })
        .where(and(eq(recurringExpense.id, id), eq(recurringExpense.notebookId, notebookId)));
      return (await this.find(tx, notebookId, id))!;
    });
  }

  /**
   * Suppression logique, idempotente, de la récurrence et de **toutes** ses échéances (la purge les
   * effacera ensemble, ADR-026) ; l'historique reste porté par les dépenses `source = recurrence`.
   */
  async remove(notebookId: string, id: string): Promise<void> {
    if (!isUuid(id)) throw new ProblemException(404, RECURRING_NOT_FOUND);
    const now = this.clock.now();
    await withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const where = and(eq(recurringExpense.id, id), eq(recurringExpense.notebookId, notebookId));
      const [row] = await tx
        .select({ deletedAt: recurringExpense.deletedAt })
        .from(recurringExpense)
        .where(where)
        .for('update');
      if (!row) throw new ProblemException(404, RECURRING_NOT_FOUND);
      if (row.deletedAt !== null) return;
      await tx.update(recurringExpense).set({ deletedAt: now, updatedAt: now }).where(where);
      await tx
        .update(occurrence)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(occurrence.recurringExpenseId, id),
            eq(occurrence.notebookId, notebookId),
            isNull(occurrence.deletedAt),
          ),
        );
    });
  }

  private async find(
    tx: Tx | Database,
    notebookId: string,
    id: string,
  ): Promise<RecurringView | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await tx
      .select(recurringColumns)
      .from(recurringExpense)
      .where(
        and(
          eq(recurringExpense.id, id),
          eq(recurringExpense.notebookId, notebookId),
          isNull(recurringExpense.deletedAt),
        ),
      );
    return row;
  }
}
