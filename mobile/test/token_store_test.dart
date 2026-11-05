import 'package:depenseo/core/auth/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/memory_secure_store.dart';

void main() {
  const tokens = SessionTokens(
    accessToken: 'jwt-court',
    refreshToken: 'opaque-long',
  );

  test('rien n’est stocké avant la connexion', () async {
    expect(await TokenStore(MemorySecureStore()).read(), isNull);
  });

  test(
    'les jetons sont enregistrés dans le stockage sécurisé puis relus',
    () async {
      final secure = MemorySecureStore();
      await TokenStore(secure).save(tokens);

      expect(await TokenStore(secure).read(), tokens);
      expect(secure.values.values, containsAll(['jwt-court', 'opaque-long']));
    },
  );

  test('la déconnexion efface les deux jetons', () async {
    final secure = MemorySecureStore();
    final store = TokenStore(secure);
    await store.save(tokens);
    await store.clear();

    expect(await store.read(), isNull);
    expect(secure.values, isEmpty);
  });

  test(
    'un jeton orphelin (écriture interrompue) vaut absence de session',
    () async {
      final secure = MemorySecureStore();
      secure.values[TokenStore.accessKey] = 'jwt-court';

      expect(await TokenStore(secure).read(), isNull);
    },
  );
}
