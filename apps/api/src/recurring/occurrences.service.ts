// Échéances des dépenses récurrentes (F-REC-03, ADR-032) : ajuster le montant, payer (crée la
// dépense `source = recurrence`), sauter. Toute requête filtre par `notebook_id` ; les écritures
// verrouillent la ligne `notebook` (même ordre de verrous que les dépenses et les alertes).
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Tx } from '../auth/session.service.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import {
  type AmountKind,
  expense,
  occurrence,
  type OccurrenceStatus,
  recurringExpense,
} from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { checkLimitAlert } from '../limits/limit-alerts.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import type { AdjustOccurrence, PayOccurrence } from './recurring-input.js';
import { assertValidCategory, RECURRING_NOT_FOUND } from './recurring.service.js';

export const OCCURRENCE_NOT_FOUND = 'Échéance introuvable';
const NOT_PENDING = 'Échéance déjà payée ou sautée';
const EXPENSE_ID_TAKEN = 'Identifiant de dépense déjà utilisé';

const columns = {
  id: occurrence.id,
  recurringExpenseId: occurrence.recurringExpenseId,
  name: recurringExpense.name,
  dueDate: occurrence.dueDate,
  status: occurrence.status,
  adjustedAmount: occurrence.amount,
  templateAmount: recurringExpense.amount,
  currency: recurringExpense.currency,
  amountKind: recurringExpense.amountKind,
  categoryId: recurringExpense.categoryId,
  expenseId: occurrence.expenseId,
  confirmationRequestedAt: occurrence.confirmationRequestedAt,
  createdAt: occurrence.createdAt,
  updatedAt: occurrence.updatedAt,
};

export interface OccurrenceView {
  id: string;
  recurringExpenseId: string;
  /** Nom de la récurrence. */
  name: string;
  dueDate: string;
  status: OccurrenceStatus;
  /** Montant attendu (ajusté, sinon celui de la récurrence) ; payée : montant de la dépense. */
  amount: number;
  /** Le montant a été ajusté pour cette échéance (ou fixé au paiement). */
  adjusted: boolean;
  currency: string;
  amountKind: AmountKind;
  categoryId: string;
  expenseId: string | null;
  /** Mode confirmation : échéance due et non encore traitée (F-REC-02, ADR-033). */
  awaitingConfirmation: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type Row = Omit<OccurrenceView, 'amount' | 'adjusted' | 'awaitingConfirmation'> & {
  adjustedAmount: number | null;
  templateAmount: number;
  confirmationRequestedAt: Date | null;
};

const toView = ({
  adjustedAmount,
  templateAmount,
  confirmationRequestedAt,
  ...row
}: Row): OccurrenceView => ({
  ...row,
  amount: adjustedAmount ?? templateAmount,
  adjusted: adjustedAmount !== null,
  awaitingConfirmation: row.status === 'pending' && confirmationRequestedAt !== null,
});

const select = (tx: Tx | Database) =>
  tx
    .select(columns)
    .from(occurrence)
    .innerJoin(recurringExpense, eq(recurringExpense.id, occurrence.recurringExpenseId));

/**
 * Prochaines échéances en attente du carnet (tableau de bord, F-TB-01), en retard comprises, dues
 * au plus tard le `through`, par date puis identifiant.
 */
export async function pendingOccurrences(
  db: Database,
  notebookId: string,
  through: string,
  limit: number,
): Promise<OccurrenceView[]> {
  const rows = await select(db)
    .where(
      and(
        eq(occurrence.notebookId, notebookId),
        eq(occurrence.status, 'pending'),
        isNull(occurrence.deletedAt),
        lte(occurrence.dueDate, through),
        isNull(recurringExpense.deletedAt),
      ),
    )
    .orderBy(asc(occurrence.dueDate), asc(occurrence.id))
    .limit(limit);
  return rows.map(toView);
}

@Injectable()
export class OccurrencesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Échéances non supprimées d'une récurrence active, par date. */
  async list(notebookId: string, recurringId: string): Promise<OccurrenceView[]> {
    const where = and(
      eq(recurringExpense.id, recurringId),
      eq(recurringExpense.notebookId, notebookId),
      isNull(recurringExpense.deletedAt),
    );
    if (!isUuid(recurringId) || (await this.db.$count(recurringExpense, where)) === 0) {
      throw new ProblemException(404, RECURRING_NOT_FOUND);
    }
    const rows = await select(this.db)
      .where(
        and(
          eq(occurrence.recurringExpenseId, recurringId),
          eq(occurrence.notebookId, notebookId),
          isNull(occurrence.deletedAt),
        ),
      )
      .orderBy(asc(occurrence.dueDate));
    return rows.map(toView);
  }

  /** Ajuste le montant d'une échéance en attente (`null` : retour au montant de la récurrence). */
  async adjust(notebookId: string, id: string, input: AdjustOccurrence): Promise<OccurrenceView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      const found = await this.lockOccurrence(tx, notebookId, id);
      if (found.status !== 'pending') throw new ProblemException(409, NOT_PENDING);
      await tx
        .update(occurrence)
        .set({ amount: input.amount, updatedAt: now })
        .where(eq(occurrence.id, id));
      return (await findOccurrence(tx, notebookId, id))!;
    });
  }

  /** Saute une échéance en attente ; rejouer sur une échéance sautée est sans effet. */
  async skip(notebookId: string, id: string): Promise<OccurrenceView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      const found = await this.lockOccurrence(tx, notebookId, id);
      if (found.status === 'skipped') return found;
      if (found.status !== 'pending') throw new ProblemException(409, NOT_PENDING);
      await tx
        .update(occurrence)
        .set({ status: 'skipped', updatedAt: now })
        .where(eq(occurrence.id, id));
      return (await findOccurrence(tx, notebookId, id))!;
    });
  }

  /**
   * Marque l'échéance payée et crée la dépense (`source = recurrence`, catégorie, devise et nom de
   * la récurrence en note). Idempotent : rejouer avec la même `expenseId` renvoie l'échéance
   * payée ; une autre `expenseId` sur une échéance déjà payée → 409 (deux appareils hors ligne).
   * Les alertes de limite sont vérifiées ; la détection de dépense inhabituelle ne s'applique pas
   * aux récurrences (ADR-030).
   */
  async pay(
    notebookId: string,
    userId: string,
    id: string,
    input: PayOccurrence,
  ): Promise<OccurrenceView> {
    return withTransaction(this.db, async (tx) => {
      const found = await this.lockOccurrence(tx, notebookId, id);
      if (found.status === 'paid' && found.expenseId === input.expenseId) return found;
      if (found.status !== 'pending') throw new ProblemException(409, NOT_PENDING);
      const taken = await tx.$count(expense, eq(expense.id, input.expenseId));
      if (taken > 0) throw new ProblemException(409, EXPENSE_ID_TAKEN);
      await assertValidCategory(tx, notebookId, found.categoryId);
      await payOccurrence(tx, this.clock, notebookId, userId, found, input);
      return (await findOccurrence(tx, notebookId, id))!;
    });
  }

  /** Verrouille le carnet puis relit l'échéance (non supprimée) ; 404 sinon. */
  private async lockOccurrence(tx: Tx, notebookId: string, id: string): Promise<OccurrenceView> {
    await lockNotebook(tx, notebookId);
    const found = await findOccurrence(tx, notebookId, id);
    if (!found) throw new ProblemException(404, OCCURRENCE_NOT_FOUND);
    return found;
  }
}

/** Échéance non supprimée du carnet, ou `undefined`. */
export async function findOccurrence(
  tx: Tx | Database,
  notebookId: string,
  id: string,
): Promise<OccurrenceView | undefined> {
  if (!isUuid(id)) return undefined;
  const [row] = await select(tx).where(
    and(eq(occurrence.id, id), eq(occurrence.notebookId, notebookId), isNull(occurrence.deletedAt)),
  );
  return row && toView(row);
}

/**
 * Crée la dépense `recurrence` d'une échéance en attente et la marque payée, puis vérifie les
 * alertes de limite (pas de détection de dépense inhabituelle, ADR-030). L'appelant tient le verrou
 * du carnet, a vérifié le statut, la catégorie et l'unicité de `expenseId` (paiement manuel F-REC-03
 * et mode auto F-REC-02).
 */
export async function payOccurrence(
  tx: Tx,
  clock: Clock,
  notebookId: string,
  userId: string,
  found: OccurrenceView,
  input: PayOccurrence,
): Promise<void> {
  const now = clock.now();
  const amount = input.amount ?? found.amount;
  await tx
    .insert(expense)
    .values({
      id: input.expenseId,
      notebookId,
      amount,
      currency: found.currency,
      categoryId: found.categoryId,
      spentOn: input.date ?? found.dueDate,
      note: found.name,
      source: 'recurrence',
      createdAt: now,
      updatedAt: now,
    })
    // Même identifiant inséré au même instant par un autre carnet (verrou distinct) : la clé
    // primaire tranche sans erreur, la relecture filtrée par carnet détecte le conflit.
    .onDuplicateKeyUpdate({ set: { id: sql`${expense.id}` } });
  const [owner] = await tx
    .select({ notebookId: expense.notebookId })
    .from(expense)
    .where(eq(expense.id, input.expenseId));
  if (owner?.notebookId !== notebookId) throw new ProblemException(409, EXPENSE_ID_TAKEN);
  await tx
    .update(occurrence)
    .set({ status: 'paid', amount, expenseId: input.expenseId, updatedAt: now })
    .where(eq(occurrence.id, found.id));
  await checkLimitAlert(tx, clock, notebookId, userId);
}
