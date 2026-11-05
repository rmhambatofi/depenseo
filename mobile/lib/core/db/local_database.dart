import 'dart:io';

import 'package:path/path.dart' as p;

import 'app_database.dart';
import 'database_key.dart';

const localDatabaseFileName = 'depenseo.sqlite';

/// Ouvre la base locale chiffrée de [directory].
///
/// Si la clé vient d'être tirée alors qu'un fichier existe (stockage sécurisé
/// effacé, Keystore invalidé), ce fichier est indéchiffrable : il est supprimé
/// et la base repart vide, à resynchroniser (ADR-046). Une clé conservée mais
/// refusée n'entraîne jamais de suppression : l'erreur remonte.
Future<AppDatabase> openLocalDatabase(
  Directory directory,
  DatabaseKeyProvider keys,
) async {
  final key = await keys.obtain();
  final file = File(p.join(directory.path, localDatabaseFileName));
  if (key.created) {
    for (final suffix in const ['', '-wal', '-shm', '-journal']) {
      final part = File('${file.path}$suffix');
      if (part.existsSync()) part.deleteSync();
    }
  }
  final db = AppDatabase(openEncrypted(file, key.hex));
  try {
    await db.readMeta('');
  } catch (_) {
    await db.close();
    rethrow;
  }
  return db;
}
