import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

import '../secure/secure_store.dart';
import 'lock_settings.dart';

/// Code de verrouillage, préférences et compteur d'échecs, dans le coffre sécurisé.
class LockStore {
  LockStore(this._store, {Random? random})
    : _random = random ?? Random.secure();

  static const pinKey = 'lock.pin';
  static const prefsKey = 'lock.prefs';
  static const failuresKey = 'lock.failures';
  static const pinLength = 6;
  static const _scheme = 'pbkdf2-sha256';
  static const _iterations = 20000;
  static final _pinPattern = RegExp(r'^\d{6}$');

  final SecureStore _store;
  final Random _random;

  static bool isValidPin(String pin) => _pinPattern.hasMatch(pin);

  Future<LockSettings> load() async {
    final pin = await _store.read(pinKey);
    final prefs = LockSettings.decodePrefs(await _store.read(prefsKey));
    return prefs.copyWith(enabled: pin != null);
  }

  Future<void> savePrefs(LockSettings settings) =>
      _store.write(prefsKey, settings.encodePrefs());

  /// Enregistre le code haché (PBKDF2-HMAC-SHA256, sel aléatoire) et remet les échecs à zéro.
  Future<void> setPin(String pin) async {
    if (!isValidPin(pin)) throw ArgumentError('PIN must be 6 digits');
    final salt = List.generate(16, (_) => _random.nextInt(256));
    final hash = _derive(pin, salt, _iterations);
    await _store.write(
      pinKey,
      [
        _scheme,
        '$_iterations',
        base64.encode(salt),
        base64.encode(hash),
      ].join(r'$'),
    );
    await resetFailures();
  }

  Future<bool> verifyPin(String pin) async {
    final stored = (await _store.read(pinKey))?.split(r'$');
    if (stored == null || stored.length != 4 || stored[0] != _scheme) {
      return false;
    }
    final iterations = int.tryParse(stored[1]);
    if (iterations == null || iterations < 1 || iterations > 1000000) {
      return false;
    }
    if (!isValidPin(pin)) return false;
    try {
      final expected = base64.decode(stored[3]);
      final actual = _derive(pin, base64.decode(stored[2]), iterations);
      return _constantTimeEquals(expected, actual);
    } on FormatException {
      return false;
    }
  }

  Future<int> failures() async =>
      int.tryParse(await _store.read(failuresKey) ?? '') ?? 0;

  /// Ajoute un échec et renvoie le total (persistant : un redémarrage ne remet pas à zéro).
  Future<int> recordFailure() async {
    final total = await failures() + 1;
    await _store.write(failuresKey, '$total');
    return total;
  }

  Future<void> resetFailures() => _store.delete(failuresKey);

  /// Supprime le code (verrou désactivé) ; les préférences restent.
  Future<void> removePin() async {
    await _store.delete(pinKey);
    await resetFailures();
  }

  /// Efface tout (déconnexion).
  Future<void> clear() async {
    await removePin();
    await _store.delete(prefsKey);
  }

  /// PBKDF2-HMAC-SHA256, un bloc (32 octets).
  @visibleForTesting
  static List<int> derive(String pin, List<int> salt, int iterations) =>
      _derive(pin, salt, iterations);

  static List<int> _derive(String pin, List<int> salt, int iterations) {
    final hmac = Hmac(sha256, utf8.encode(pin));
    var block = hmac.convert([...salt, 0, 0, 0, 1]).bytes;
    final out = List<int>.of(block);
    for (var i = 1; i < iterations; i++) {
      block = hmac.convert(block).bytes;
      for (var j = 0; j < out.length; j++) {
        out[j] ^= block[j];
      }
    }
    return out;
  }

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }
}
