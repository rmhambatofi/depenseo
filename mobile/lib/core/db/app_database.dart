import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';

part 'app_database.g.dart';

/// Métadonnées locales (curseurs de synchro, version de schéma serveur…).
/// Les tables métier arrivent avec leurs tâches (P6-04, P6-05).
@DataClassName('AppMetaEntry')
class AppMeta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

@DriftDatabase(tables: [AppMeta])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  @override
  int get schemaVersion => 1;

  Future<void> writeMeta(String key, String value) =>
      into(appMeta)
          .insertOnConflictUpdate(AppMetaEntry(key: key, value: value));

  Future<String?> readMeta(String key) async {
    final row = await (select(
      appMeta,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    return row?.value;
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
