import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';

part 'app_database.g.dart';

/// Métadonnées locales (curseurs de synchro, contexte du compte…).
@DataClassName('AppMetaEntry')
class AppMeta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

/// Copie locale des catégories du carnet (champs de la synchro, ADR-026),
/// alimentée par la synchronisation (P6-05) et la personnalisation (P6-07).
@TableIndex(
  name: 'category_notebook_updated',
  columns: {#notebookId, #updatedAt, #id},
)
class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get notebookId => text()();
  TextColumn get parentId => text().nullable()();
  TextColumn get systemKey => text().nullable()();
  TextColumn get name => text()();
  TextColumn get icon => text()();
  TextColumn get color => text()();
  IntColumn get position => integer().withDefault(const Constant(0))();
  BoolColumn get hidden => boolean().withDefault(const Constant(false))();

  /// Horodatages ISO 8601 UTC (DATETIME(3) côté serveur).
  TextColumn get updatedAt => text()();
  TextColumn get deletedAt => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// Dépenses locales. `amount` en unités mineures (entier), `date` calendaire
/// `AAAA-MM-JJ` jamais convertie, `tags` = tableau JSON de noms.
@TableIndex(
  name: 'expense_notebook_updated',
  columns: {#notebookId, #updatedAt, #id},
)
@TableIndex(name: 'expense_notebook_date', columns: {#notebookId, #date})
class Expenses extends Table {
  /// UUID v7 tiré sur l'appareil (insert idempotent côté API).
  TextColumn get id => text()();
  TextColumn get notebookId => text()();
  IntColumn get amount => integer()();
  TextColumn get currency => text().withLength(min: 3, max: 3)();
  TextColumn get categoryId => text()();
  TextColumn get date => text().withLength(min: 10, max: 10)();
  TextColumn get note => text().nullable()();
  TextColumn get merchant => text().nullable()();
  TextColumn get tags => text().withDefault(const Constant('[]'))();
  TextColumn get createdAt => text()();
  TextColumn get updatedAt => text()();
  TextColumn get deletedAt => text().nullable()();

  /// Modification locale pas encore acceptée par l'API (file d'envoi, P6-05).
  BoolColumn get pendingSync => boolean().withDefault(const Constant(true))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

@DriftDatabase(tables: [AppMeta, Categories, Expenses])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.createTable(categories);
        await m.createIndex(categoryNotebookUpdated);
        await m.createTable(expenses);
        await m.createIndex(expenseNotebookUpdated);
        await m.createIndex(expenseNotebookDate);
      }
    },
  );

  Future<void> writeMeta(String key, String value) =>
      into(appMeta)
          .insertOnConflictUpdate(AppMetaEntry(key: key, value: value));

  Future<String?> readMeta(String key) async {
    final row = await (select(
      appMeta,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  /// Catégories utilisables pour une saisie : non supprimées, non masquées,
  /// dont la racine n'est ni masquée ni supprimée ; racines d'abord, par position.
  Future<List<Category>> selectableCategories(String notebookId) async {
    final rows =
        await (select(categories)
              ..where(
                (c) =>
                    c.notebookId.equals(notebookId) &
                    c.deletedAt.isNull() &
                    c.hidden.equals(false),
              )
              ..orderBy([(c) => OrderingTerm.asc(c.position)]))
            .get();
    final roots = {
      for (final c in rows)
        if (c.parentId == null) c.id: c,
    };
    return [
      ...roots.values,
      for (final c in rows)
        if (c.parentId != null && roots.containsKey(c.parentId)) c,
    ];
  }

  /// Enregistre une dépense saisie sur l'appareil, en attente d'envoi.
  Future<void> insertLocalExpense({
    required String id,
    required String notebookId,
    required int amount,
    required String currency,
    required String categoryId,
    required String date,
    required DateTime now,
    String? note,
    String? merchant,
    List<String> tags = const [],
  }) {
    // Milliseconde près, comme DATETIME(3) côté serveur.
    final stamp = DateTime.fromMillisecondsSinceEpoch(
      now.millisecondsSinceEpoch,
      isUtc: true,
    ).toIso8601String();
    return into(expenses).insert(
      ExpensesCompanion.insert(
        id: id,
        notebookId: notebookId,
        amount: amount,
        currency: currency,
        categoryId: categoryId,
        date: date,
        note: Value(note),
        merchant: Value(merchant),
        tags: Value(jsonEncode(tags)),
        createdAt: stamp,
        updatedAt: stamp,
      ),
    );
  }

  /// Version de SQLCipher liée ; vide si la bibliothèque n'est pas SQLCipher.
  Future<String> cipherVersion() async {
    final row = await customSelect('PRAGMA cipher_version').getSingleOrNull();
    return row?.data.values.first?.toString() ?? '';
  }
}

final _hexKey = RegExp(r'^[0-9a-f]{64}$');

/// Ouvre [file] chiffré par SQLCipher avec une clé brute de 256 bits ([hexKey]).
/// Refuse de démarrer si la bibliothèque liée n'est pas SQLCipher.
QueryExecutor openEncrypted(File file, String hexKey) {
  if (!_hexKey.hasMatch(hexKey)) {
    throw ArgumentError('La clé doit compter 64 caractères hexadécimaux');
  }
  return NativeDatabase.createInBackground(
    file,
    setup: (db) {
      final cipher = db.select('PRAGMA cipher_version');
      if (cipher.isEmpty) {
        throw StateError('SQLCipher absent : base locale non chiffrée refusée');
      }
      db.execute("PRAGMA key = \"x'$hexKey'\"");
      // Échoue ici si la clé ne correspond pas à la base existante.
      db.select('SELECT count(*) FROM sqlite_master');
    },
  );
}
