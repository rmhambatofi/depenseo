import 'dart:convert';

import 'package:drift/drift.dart';

import 'app_database.dart';
import 'expense_filter.dart';

/// Lecture et modification locales des dépenses (P6-06, ADR-050/051) : toute
/// écriture repasse la ligne en attente d'envoi, efface `sync_error` et garde
/// `base_updated_at` (version serveur dont elle part).
extension ExpenseStore on AppDatabase {
  Future<Expense?> expenseById(String id) =>
      (select(expenses)..where((e) => e.id.equals(id))).getSingleOrNull();

  /// Dépenses actives du carnet répondant à [filter], date puis saisie
  /// décroissantes, avec le nom de leur catégorie s'il est connu.
  Future<List<(Expense, String?)>> searchExpenses(
    String notebookId,
    ExpenseFilter filter, {
    int limit = 500,
  }) async {
    var where =
        expenses.notebookId.equals(notebookId) & expenses.deletedAt.isNull();
    if (filter.from != null) {
      where &= expenses.date.isBiggerOrEqualValue(filter.from!);
    }
    if (filter.to != null) {
      where &= expenses.date.isSmallerOrEqualValue(filter.to!);
    }
    if (filter.minAmount != null) {
      where &= expenses.amount.isBiggerOrEqualValue(filter.minAmount!);
    }
    if (filter.maxAmount != null) {
      where &= expenses.amount.isSmallerOrEqualValue(filter.maxAmount!);
    }
    if (filter.categoryIds.isNotEmpty) {
      where &=
          expenses.categoryId.isIn(filter.categoryIds) |
          categories.parentId.isIn(filter.categoryIds);
    }
    final text = filter.foldedText;
    final query =
        select(expenses).join([
            leftOuterJoin(
              categories,
              categories.id.equalsExp(expenses.categoryId),
            ),
          ])
          ..where(where)
          ..orderBy([
            OrderingTerm.desc(expenses.date),
            OrderingTerm.desc(expenses.createdAt),
            OrderingTerm.desc(expenses.id),
          ]);
    // Texte : comparaison sans accents faite ici (SQLite ne plie que l'ASCII),
    // donc la limite s'applique après le filtrage.
    if (text.isEmpty) query.limit(limit);
    final rows = await query.get();
    final result = <(Expense, String?)>[];
    for (final r in rows) {
      final e = r.readTable(expenses);
      if (text.isNotEmpty && !_matches(e, text)) continue;
      result.add((e, r.readTableOrNull(categories)?.name));
      if (result.length >= limit) break;
    }
    return result;
  }

  /// Catégories proposées comme filtre : toutes celles non supprimées, même
  /// masquées (des dépenses peuvent les porter) ; racines d'abord.
  Future<List<Category>> filterableCategories(String notebookId) async {
    final rows =
        await (select(categories)
              ..where(
                (c) => c.notebookId.equals(notebookId) & c.deletedAt.isNull(),
              )
              ..orderBy([(c) => OrderingTerm.asc(c.position)]))
            .get();
    final roots = {
      for (final c in rows)
        if (c.parentId == null) c.id,
    };
    return [
      ...rows.where((c) => c.parentId == null),
      ...rows.where((c) => c.parentId != null && roots.contains(c.parentId)),
    ];
  }

  /// `false` si la dépense n'existe plus localement (supprimée entre-temps).
  Future<bool> updateLocalExpense(
    String id, {
    required int amount,
    required String categoryId,
    required String date,
    required String? note,
    required String? merchant,
    required List<String> tags,
    required DateTime now,
  }) async =>
      await _touch(
        id,
        now,
        ExpensesCompanion(
          amount: Value(amount),
          categoryId: Value(categoryId),
          date: Value(date),
          note: Value(note),
          merchant: Value(merchant),
          tags: Value(jsonEncode(tags)),
        ),
      ) ==
      1;

  /// Suppression logique, envoyée par la synchro (`DELETE`).
  Future<void> markExpenseDeleted(String id, DateTime now) =>
      _touch(id, now, ExpensesCompanion(deletedAt: Value(utcStamp(now))));

  /// Après `POST …/restore` accepté : la ligne en conflit repose désormais
  /// sur la version restaurée ([restoredUpdatedAt], `updatedAt` renvoyé par
  /// l'API) et est de nouveau envoyée : le serveur n'ayant pas changé depuis,
  /// elle l'emporte (PATCH) quelle que soit l'horloge de l'appareil.
  Future<void> markExpenseRestored(
    String id,
    DateTime now,
    String restoredUpdatedAt,
  ) => _touch(
    id,
    now,
    ExpensesCompanion(
      baseUpdatedAt: Value(
        DateTime.parse(restoredUpdatedAt).toUtc().toIso8601String(),
      ),
    ),
  );

  /// Abandon d'une ligne en conflit (supprimée ailleurs) : la copie locale
  /// est retirée ; la synchro apportera la version supprimée du serveur.
  Future<void> discardExpense(String id) =>
      (delete(expenses)..where((e) => e.id.equals(id))).go();

  /// Nombre de lignes touchées (0 : absente ou déjà supprimée localement).
  Future<int> _touch(String id, DateTime now, ExpensesCompanion changes) =>
      (update(
        expenses,
      )..where((e) => e.id.equals(id) & e.deletedAt.isNull())).write(
        changes.copyWith(
          updatedAt: Value(utcStamp(now)),
          pendingSync: const Value(true),
          syncError: const Value(null),
        ),
      );
}

bool _matches(Expense e, String folded) =>
    foldForSearch(e.note ?? '').contains(folded) ||
    foldForSearch(e.merchant ?? '').contains(folded);
