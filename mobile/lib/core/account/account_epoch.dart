import 'package:uuid/uuid.dart';

import '../secure/secure_store.dart';

/// Marqueur aléatoire de la session de compte courante, dans le coffre :
/// renouvelé à chaque connexion, effacé à la déconnexion. La copie locale du
/// contexte du compte n'est resservie que sous le même marqueur (ADR-049).
class AccountEpoch {
  AccountEpoch(this._store);

  static const key = 'account.epoch';

  final SecureStore _store;

  /// Marqueur courant ; créé s'il manque (session antérieure à ce mécanisme).
  Future<String> current() async {
    final existing = await _store.read(key);
    if (existing != null) return existing;
    final created = const Uuid().v4();
    await _store.write(key, created);
    return created;
  }

  /// Marqueur courant sans en créer (`null` hors session).
  Future<String?> read() => _store.read(key);

  Future<void> rotate() => _store.write(key, const Uuid().v4());

  Future<void> clear() => _store.delete(key);
}
