// Catégories d'un carnet (F-CAT-02, §8.3, ADR-023). Toute requête filtre par `notebook_id` : la
// garde de carnet ne protège pas une catégorie d'un autre carnet désignée par son identifiant.
// Les écritures verrouillent la ligne `notebook` : deux modifications concurrentes de la
// hiérarchie (parent, suppression) ne peuvent pas produire un troisième niveau ni un orphelin.
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { Tx } from '../auth/session.service.js';
import { CLOCK, type Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { DB } from '../db/database.module.js';
import { CUSTOM_CATEGORY_POSITION, category } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';
import { isUuid } from '../db/uuid.js';
import { ProblemException } from '../errors/problem.exception.js';
import { lockNotebook } from '../notebooks/notebook-lock.js';
import type { CreateCategory, UpdateCategory } from './category-input.js';

export interface CategoryView {
  id: string;
  parentId: string | null;
  systemKey: string | null;
  name: string;
  icon: string;
  color: string;
  hidden: boolean;
}

export const CATEGORY_NOT_FOUND = 'Catégorie introuvable';
const INVALID_PARENT = 'Catégorie parente invalide : racine active du même carnet attendue';

const columns = {
  id: category.id,
  parentId: category.parentId,
  systemKey: category.systemKey,
  name: category.name,
  icon: category.icon,
  color: category.color,
  hidden: category.hidden,
};

const parent = alias(category, 'parent');

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Catégories non supprimées ; sans `includeHidden`, ni masquées ni filles d'une racine masquée. */
  async list(notebookId: string, includeHidden: boolean): Promise<CategoryView[]> {
    return this.db
      .select(columns)
      .from(category)
      .leftJoin(parent, eq(parent.id, category.parentId))
      .where(
        and(
          eq(category.notebookId, notebookId),
          isNull(category.deletedAt),
          includeHidden
            ? undefined
            : and(eq(category.hidden, false), or(isNull(parent.id), eq(parent.hidden, false))),
        ),
      )
      .orderBy(
        // Racines d'abord dans l'ordre d'affichage, puis leurs enfants (ordre stable).
        asc(sql`coalesce(${parent.position}, ${category.position})`),
        asc(sql`coalesce(${parent.id}, ${category.id})`),
        asc(sql`${category.parentId} is not null`),
        asc(category.position),
        asc(category.name),
        asc(category.id),
      );
  }

  async get(notebookId: string, id: string): Promise<CategoryView> {
    const found = await this.find(this.db, notebookId, id);
    if (!found) throw new ProblemException(404, CATEGORY_NOT_FOUND);
    return found;
  }

  /**
   * Insertion idempotente par UUID client (§8.2) : un rejeu renvoie la ligne existante sans la
   * modifier (la première écriture gagne). Identifiant pris dans un autre carnet, ou catégorie
   * supprimée → 409.
   */
  async create(notebookId: string, input: CreateCategory): Promise<CategoryView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const [existing] = await tx
        .select({ notebookId: category.notebookId, deletedAt: category.deletedAt })
        .from(category)
        .where(eq(category.id, input.id));
      if (!existing) {
        if (input.parentId) await this.assertValidParent(tx, notebookId, input.parentId, input.id);
        await tx
          .insert(category)
          .values({
            id: input.id,
            notebookId,
            parentId: input.parentId ?? null,
            name: input.name,
            icon: input.icon,
            color: input.color,
            position: CUSTOM_CATEGORY_POSITION,
            createdAt: now,
            updatedAt: now,
          })
          // Course entre deux rejeux : l'unicité de la clé primaire tranche, sans erreur.
          .onDuplicateKeyUpdate({ set: { id: sql`${category.id}` } });
      } else if (existing.notebookId !== notebookId || existing.deletedAt !== null) {
        throw new ProblemException(409, 'Identifiant de catégorie déjà utilisé');
      }
      const created = await this.find(tx, notebookId, input.id);
      if (!created) throw new ProblemException(409, 'Identifiant de catégorie déjà utilisé');
      return created;
    });
  }

  async update(notebookId: string, id: string, patch: UpdateCategory): Promise<CategoryView> {
    const now = this.clock.now();
    return withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      if (!(await this.find(tx, notebookId, id))) {
        throw new ProblemException(404, CATEGORY_NOT_FOUND);
      }
      if (patch.parentId) {
        await this.assertValidParent(tx, notebookId, patch.parentId, id);
        if (await this.hasActiveChildren(tx, id)) throw new ProblemException(422, INVALID_PARENT);
      }
      await tx
        .update(category)
        .set({ ...patch, updatedAt: now })
        .where(and(eq(category.id, id), eq(category.notebookId, notebookId)));
      return (await this.find(tx, notebookId, id))!;
    });
  }

  /** Suppression logique, idempotente ; refusée pour le plan par défaut (masquer) et un parent. */
  async remove(notebookId: string, id: string): Promise<void> {
    if (!isUuid(id)) throw new ProblemException(404, CATEGORY_NOT_FOUND);
    const now = this.clock.now();
    await withTransaction(this.db, async (tx) => {
      await lockNotebook(tx, notebookId);
      const [row] = await tx
        .select({ systemKey: category.systemKey, deletedAt: category.deletedAt })
        .from(category)
        .where(and(eq(category.id, id), eq(category.notebookId, notebookId)));
      if (!row) throw new ProblemException(404, CATEGORY_NOT_FOUND);
      if (row.deletedAt !== null) return;
      if (row.systemKey !== null) {
        throw new ProblemException(
          409,
          'Une catégorie du plan par défaut se masque, elle ne se supprime pas',
        );
      }
      if (await this.hasActiveChildren(tx, id)) {
        throw new ProblemException(409, 'Supprimer ou déplacer d’abord les sous-catégories');
      }
      await tx
        .update(category)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(category.id, id), eq(category.notebookId, notebookId)));
    });
  }

  private async find(tx: Tx | Database, notebookId: string, id: string) {
    if (!isUuid(id)) return undefined;
    const [row] = await tx
      .select(columns)
      .from(category)
      .where(
        and(eq(category.id, id), eq(category.notebookId, notebookId), isNull(category.deletedAt)),
      );
    return row;
  }

  /** Parent = racine non supprimée du même carnet, autre que la catégorie elle-même. */
  private async assertValidParent(tx: Tx, notebookId: string, parentId: string, selfId: string) {
    const found = parentId === selfId ? undefined : await this.find(tx, notebookId, parentId);
    if (!found || found.parentId !== null) throw new ProblemException(422, INVALID_PARENT);
  }

  private async hasActiveChildren(tx: Tx, id: string): Promise<boolean> {
    const [child] = await tx
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.parentId, id), isNull(category.deletedAt)))
      .limit(1);
    return child !== undefined;
  }
}
