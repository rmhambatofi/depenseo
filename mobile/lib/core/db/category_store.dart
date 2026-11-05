import 'package:drift/drift.dart';

import 'app_database.dart';

/// Catégorie racine et ses sous-catégories, dans l'ordre du plan.
class CategoryNode {
  const CategoryNode(this.category, this.children);

  final Category category;
  final List<Category> children;
}

/// Lecture et écriture locales des catégories (P6-07, ADR-052). Les écritures
/// passent d'abord par l'API (en ligne) ; la copie locale reprend ensuite la
/// réponse, en attendant que la synchro apporte la ligne complète.
extension CategoryStore on AppDatabase {
  /// Arbre des catégories non supprimées du carnet, masquées comprises
  /// (écran de gestion) ; sous-catégories orphelines ignorées.
  Future<List<CategoryNode>> categoryTree(String notebookId) async {
    final rows =
        await (select(categories)
              ..where(
                (c) => c.notebookId.equals(notebookId) & c.deletedAt.isNull(),
              )
              ..orderBy([
                (c) => OrderingTerm.asc(c.position),
                (c) => OrderingTerm.asc(c.id),
              ]))
            .get();
    return [
      for (final root in rows.where((c) => c.parentId == null))
        CategoryNode(root, [
          for (final c in rows)
            if (c.parentId == root.id) c,
        ]),
    ];
  }

  Future<Category?> categoryById(String id) =>
      (select(categories)..where((c) => c.id.equals(id))).getSingleOrNull();

  /// Reprend une catégorie renvoyée par `POST`/`PATCH …/categories` (sans
  /// `position` ni `updatedAt`) : une ligne existante garde sa place et son
  /// horodatage ; une nouvelle se range en dernier, datée de [now].
  Future<void> storeCategoryFromApi(
    String notebookId,
    Map<String, dynamic> remote,
    DateTime now,
  ) => transaction(() async {
    final id = remote['id'] as String;
    final fields = CategoriesCompanion(
      parentId: Value(remote['parentId'] as String?),
      systemKey: Value(remote['systemKey'] as String?),
      name: Value(remote['name'] as String),
      icon: Value(remote['icon'] as String),
      color: Value(remote['color'] as String),
      hidden: Value(remote['hidden'] as bool),
    );
    final updated =
        await (update(categories)
              ..where((c) => c.id.equals(id) & c.notebookId.equals(notebookId)))
            .write(fields);
    // Déjà là (ou, en théorie, dans un autre carnet : laissée intacte).
    if (updated > 0 || await categoryById(id) != null) return;
    final last = categories.position.max();
    final maxPosition =
        await (selectOnly(categories)
              ..addColumns([last])
              ..where(categories.notebookId.equals(notebookId)))
            .map((r) => r.read(last))
            .getSingle();
    await into(categories).insert(
      fields.copyWith(
        id: Value(id),
        notebookId: Value(notebookId),
        position: Value((maxPosition ?? 0) + 1),
        updatedAt: Value(utcStamp(now)),
      ),
    );
  });
}
