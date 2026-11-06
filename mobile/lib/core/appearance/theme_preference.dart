import 'package:flutter/material.dart';

import '../secure/secure_store.dart';

/// Choix Clair / Auto / Sombre (docs/dev/UI.md) : préférence de l'appareil,
/// non synchronisée, conservée à la déconnexion (aucune donnée de compte).
class ThemePreference {
  ThemePreference(this._store);

  static const key = 'ui.theme';

  final SecureStore _store;

  static String encode(ThemeMode mode) => mode.name;

  /// Absente ou illisible → Auto.
  static ThemeMode decode(String? raw) =>
      ThemeMode.values.where((m) => m.name == raw).firstOrNull ??
      ThemeMode.system;

  Future<ThemeMode> load() async => decode(await _store.read(key));

  Future<void> save(ThemeMode mode) => _store.write(key, encode(mode));
}
