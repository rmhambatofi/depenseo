import 'package:depenseo/core/lock/lock_settings.dart';
import 'package:depenseo/core/lock/lock_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/memory_secure_store.dart';

void main() {
  late MemorySecureStore secure;
  late LockStore store;

  setUp(() {
    secure = MemorySecureStore();
    store = LockStore(secure);
  });

  test('sans code, le verrou est désactivé', () async {
    final settings = await store.load();
    expect(settings.enabled, isFalse);
    expect(settings.delay, LockDelay.immediate);
  });

  test('le code est haché avec sel, jamais stocké en clair', () async {
    await store.setPin('123456');
    expect(secure.values.values.any((v) => v.contains('123456')), isFalse);
    expect(await store.verifyPin('123456'), isTrue);
    expect(await store.verifyPin('654321'), isFalse);
    expect((await store.load()).enabled, isTrue);

    // Deux enregistrements du même code : sels différents.
    final first = Map.of(secure.values);
    await store.setPin('123456');
    expect(secure.values, isNot(equals(first)));
  });

  test('PBKDF2-HMAC-SHA256 : vecteur RFC 7914 §11 (32 premiers octets)', () {
    final out = LockStore.derive('passwd', 'salt'.codeUnits, 1);
    expect(
      out.map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc',
    );
  });

  test('rejette un code qui n’a pas 6 chiffres', () async {
    expect(() => store.setPin('12345'), throwsArgumentError);
    expect(() => store.setPin('12345a'), throwsArgumentError);
  });

  test(
    'préférences conservées ; préférences illisibles → valeurs par défaut',
    () async {
      await store.setPin('123456');
      await store.savePrefs(
        const LockSettings(
          delay: LockDelay.fiveMinutes,
          biometrics: true,
          blockScreenshots: true,
        ),
      );
      final loaded = await store.load();
      expect(loaded.enabled, isTrue);
      expect(loaded.delay, LockDelay.fiveMinutes);
      expect(loaded.biometrics, isTrue);
      expect(loaded.blockScreenshots, isTrue);

      await secure.write(LockStore.prefsKey, 'n’importe quoi');
      final fallback = await store.load();
      expect(fallback.enabled, isTrue, reason: 'le code seul décide du verrou');
      expect(fallback.delay, LockDelay.immediate);
    },
  );

  test('compteur d’échecs persistant, remis à zéro par clear', () async {
    await store.setPin('123456');
    expect(await store.recordFailure(), 1);
    expect(await LockStore(secure).recordFailure(), 2);
    expect(await store.failures(), 2);
    await store.resetFailures();
    expect(await store.failures(), 0);
    await store.recordFailure();
    await store.clear();
    expect(secure.values, isEmpty);
  });
}
