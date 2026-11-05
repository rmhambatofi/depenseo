import 'package:depenseo/core/secure/secure_store.dart';

/// Stockage sécurisé en mémoire pour les tests (remplace Keychain/Keystore).
class MemorySecureStore implements SecureStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}
