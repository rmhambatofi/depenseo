// Copie du plan par défaut dans un carnet (F-CAT-01, ADR-023), dans la transaction qui crée le
// carnet. Une sous-catégorie reprend l'icône et la couleur de sa racine.
import type { Tx } from '../auth/session.service.js';
import type { Database } from '../db/connection.js';
import { category } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';
import { DEFAULT_CATEGORY_PLAN, defaultLabel } from './default-plan.js';

export async function seedDefaultCategories(
  tx: Tx | Database,
  { notebookId, language, now }: { notebookId: string; language: string; now: Date },
): Promise<void> {
  const rows: (typeof category.$inferInsert)[] = [];
  DEFAULT_CATEGORY_PLAN.forEach((root, rootIndex) => {
    const rootId = newId();
    const common = {
      notebookId,
      icon: root.icon,
      color: root.color,
      createdAt: now,
      updatedAt: now,
    };
    rows.push({
      ...common,
      id: rootId,
      systemKey: root.key,
      name: defaultLabel(root, language),
      position: rootIndex,
    });
    root.children.forEach((child, childIndex) => {
      rows.push({
        ...common,
        id: newId(),
        parentId: rootId,
        systemKey: child.key,
        name: defaultLabel(child, language),
        position: childIndex,
      });
    });
  });
  await tx.insert(category).values(rows);
}
