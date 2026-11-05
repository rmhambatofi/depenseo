import 'package:flutter/foundation.dart';

import '../secure/secure_store.dart';

@immutable
class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});

  /// Corps de `/auth/login`, `/auth/refresh` et `/auth/social` (ADR-018).
  factory SessionTokens.fromJson(Map<String, dynamic> json) {
    final access = json['accessToken'];
    final refresh = json['refreshToken'];
    if (access is! String || refresh is! String) {
      throw const FormatException('Réponse de session invalide');
    }
    return SessionTokens(accessToken: access, refreshToken: refresh);
  }

  final String accessToken;
  final String refreshToken;

  @override
  bool operator ==(Object other) =>
      other is SessionTokens &&
      other.accessToken == accessToken &&
      other.refreshToken == refreshToken;

  @override
  int get hashCode => Object.hash(accessToken, refreshToken);
}

/// Jetons de session dans le trousseau / Keystore (NF-SEC-02), jamais en clair sur disque.
///
/// Opérations sérialisées ; chaque écriture ou effacement ouvre une nouvelle **génération** :
/// un refresh lancé avant une déconnexion (ou une nouvelle connexion) ne peut plus écrire
/// ni effacer la session qui l'a remplacé ([saveIfCurrent], [clearIfCurrent]).
class TokenStore {
  TokenStore(this._store);

  static const accessKey = 'depenseo.access_token';
  static const refreshKey = 'depenseo.refresh_token';

  final SecureStore _store;
  int _generation = 0;
  Future<void> _tail = Future.value();

  /// Génération courante, à relever avant de lire la session à faire tourner.
  int get generation => _generation;

  Future<SessionTokens?> read() => _locked(() async {
    final access = await _store.read(accessKey);
    final refresh = await _store.read(refreshKey);
    if (access == null || refresh == null) return null;
    return SessionTokens(accessToken: access, refreshToken: refresh);
  });

  Future<void> save(SessionTokens tokens) => _locked(() => _write(tokens));

  Future<void> clear() => _locked(_delete);

  /// Écrit [tokens] seulement si la session n'a pas changé depuis [generation].
  Future<bool> saveIfCurrent(int generation, SessionTokens tokens) =>
      _locked(() async {
        if (generation != _generation) return false;
        await _write(tokens);
        return true;
      });

  /// Efface la session seulement si elle n'a pas changé depuis [generation].
  Future<bool> clearIfCurrent(int generation) => _locked(() async {
    if (generation != _generation) return false;
    await _delete();
    return true;
  });

  Future<void> _write(SessionTokens tokens) async {
    _generation++;
    // Refresh d'abord : un arrêt entre les deux écritures laisse un refresh valide
    // (l'ancien jeton d'accès échoue en 401 et provoque un échange légitime).
    await _store.write(refreshKey, tokens.refreshToken);
    await _store.write(accessKey, tokens.accessToken);
  }

  Future<void> _delete() async {
    _generation++;
    await _store.delete(accessKey);
    await _store.delete(refreshKey);
  }

  Future<T> _locked<T>(Future<T> Function() action) {
    final result = _tail.then((_) => action());
    _tail = result.then<void>((_) {}, onError: (Object _) {});
    return result;
  }
}
