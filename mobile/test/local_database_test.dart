import 'dart:io';
import 'dart:math';

import 'package:depenseo/core/db/database_key.dart';
import 'package:depenseo/core/db/local_database.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/memory_secure_store.dart';

void main() {
  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('depenseo-local-'));
  tearDown(() => dir.deleteSync(recursive: true));

  test('rouvre la base existante avec la clé conservée', () async {
    final secure = MemorySecureStore();
    final first = await openLocalDatabase(dir, DatabaseKeyProvider(secure));
    await first.writeMeta('k', 'v');
    await first.close();

    final second = await openLocalDatabase(dir, DatabaseKeyProvider(secure));
    expect(await second.readMeta('k'), 'v');
    await second.close();
  });

  test('clé perdue (stockage sécurisé effacé) : la base indéchiffrable est recréée vide', () async {
    final first = await openLocalDatabase(
      dir,
      DatabaseKeyProvider(MemorySecureStore()),
    );
    await first.writeMeta('k', 'v');
    await first.close();

    final fresh = MemorySecureStore();
    final second = await openLocalDatabase(
      dir,
      DatabaseKeyProvider(fresh, random: Random(9)),
    );
    expect(await second.readMeta('k'), isNull);
    await second.close();
  });

  test('clé conservée mais refusée : la base n’est jamais supprimée', () async {
    final secure = MemorySecureStore();
    final first = await openLocalDatabase(dir, DatabaseKeyProvider(secure));
    await first.writeMeta('k', 'v');
    await first.close();
    final original = secure.values[DatabaseKeyProvider.storageKey];
    secure.values[DatabaseKeyProvider.storageKey] = 'ab' * 32;

    await expectLater(
      openLocalDatabase(dir, DatabaseKeyProvider(secure)),
      throwsA(isA<Exception>()),
    );
    expect(File('${dir.path}/$localDatabaseFileName').existsSync(), isTrue);

    secure.values[DatabaseKeyProvider.storageKey] = original!;
    final intact = await openLocalDatabase(dir, DatabaseKeyProvider(secure));
    expect(await intact.readMeta('k'), 'v');
    await intact.close();
  });
}
