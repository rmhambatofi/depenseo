import 'package:flutter/foundation.dart';

import '../secure/secure_store.dart';

@immutable
class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});

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
class TokenStore {
  TokenStore(this._store);

  static const accessKey = 'depenseo.access_token';
  static const refreshKey = 'depenseo.refresh_token';

  final SecureStore _store;

  Future<SessionTokens?> read() async {
    final access = await _store.read(accessKey);
    final refresh = await _store.read(refreshKey);
    if (access == null || refresh == null) return null;
    return SessionTokens(accessToken: access, refreshToken: refresh);
  }

  Future<void> save(SessionTokens tokens) async {
    await _store.write(accessKey, tokens.accessToken);
    await _store.write(refreshKey, tokens.refreshToken);
  }

  Future<void> clear() async {
    await _store.delete(accessKey);
    await _store.delete(refreshKey);
  }
}
