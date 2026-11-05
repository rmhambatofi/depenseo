import 'dart:math';

import '../secure/secure_store.dart';

/// [created] : clé tirée à l'instant (aucune clé valide n'était conservée).
typedef DatabaseKey = ({String hex, bool created});

/// Clé SQLCipher de 256 bits, tirée une fois par installation et gardée
/// dans le stockage sécurisé, jamais sur disque en clair.
class DatabaseKeyProvider {
  DatabaseKeyProvider(this._store, {Random? random})
    : _random = random ?? Random.secure();

  static const storageKey = 'depenseo.db_key';
  static final _valid = RegExp(r'^[0-9a-f]{64}$');

  final SecureStore _store;
  final Random _random;

  Future<DatabaseKey> obtain() async {
    final existing = await _store.read(storageKey);
    if (existing != null && _valid.hasMatch(existing)) {
      return (hex: existing, created: false);
    }
    final key = List.generate(
      32,
      (_) => _random.nextInt(256),
    ).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
    await _store.write(storageKey, key);
    return (hex: key, created: true);
  }
}
