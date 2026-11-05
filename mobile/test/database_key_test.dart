import 'dart:math';

import 'package:depenseo/core/db/database_key.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/memory_secure_store.dart';

void main() {
  test('crée une clé de 256 bits en hexadécimal et la garde dans le stockage sécurisé', () async {
    final store = MemorySecureStore();
    final key = await DatabaseKeyProvider(store, random: Random(1)).obtain();

    expect(key.hex, matches(RegExp(r'^[0-9a-f]{64}$')));
    expect(key.created, isTrue);
    expect(store.values.values, contains(key.hex));
  });

  test('réutilise la clé existante au démarrage suivant', () async {
    final store = MemorySecureStore();
    final first = await DatabaseKeyProvider(store, random: Random(1)).obtain();
    final second = await DatabaseKeyProvider(store, random: Random(2)).obtain();

    expect(second.hex, first.hex);
    expect(second.created, isFalse);
  });

  test('deux installations obtiennent des clés différentes', () async {
    final a = await DatabaseKeyProvider(
      MemorySecureStore(),
      random: Random(1),
    ).obtain();
    final b = await DatabaseKeyProvider(
      MemorySecureStore(),
      random: Random(2),
    ).obtain();

    expect(a.hex, isNot(b.hex));
  });

  test('remplace une clé stockée corrompue plutôt que de l’injecter dans PRAGMA key', () async {
    final store = MemorySecureStore();
    store.values[DatabaseKeyProvider.storageKey] = "x'; DROP TABLE";
    final key = await DatabaseKeyProvider(store, random: Random(3)).obtain();

    expect(key.hex, matches(RegExp(r'^[0-9a-f]{64}$')));
    expect(key.created, isTrue);
  });
}
