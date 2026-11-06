import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/appearance/theme_preference.dart';
import '../../providers.dart';

/// Préférence lue par `main()` avant le premier rendu (aucun changement de
/// thème visible à l'ouverture) ; `null` : lue par le contrôleur (tests).
final initialThemeModeProvider = Provider<ThemeMode?>((ref) => null);

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(
  ThemeModeController.new,
);

class ThemeModeController extends Notifier<ThemeMode> {
  bool _chosen = false;
  Future<void> _tail = Future.value();

  ThemePreference get _prefs => ThemePreference(ref.read(secureStoreProvider));

  @override
  ThemeMode build() {
    final initial = ref.read(initialThemeModeProvider);
    if (initial != null) return initial;
    _enqueue(() async {
      final saved = await _prefs.load();
      // Un choix fait pendant la lecture l'emporte.
      if (!_chosen) state = saved;
    });
    return ThemeMode.system;
  }

  Future<void> set(ThemeMode mode) {
    _chosen = true;
    state = mode;
    return _enqueue(() => _prefs.save(mode));
  }

  /// Opérations dans l'ordre des choix. Un coffre en échec n'est pas une
  /// erreur pour l'utilisateur : le choix reste appliqué pour la session et
  /// Auto est repris au prochain démarrage (préférence sans enjeu, rien à
  /// journaliser).
  Future<void> _enqueue(Future<void> Function() op) {
    final result = _tail.then((_) => op());
    _tail = result.then((_) {}, onError: (_) {});
    return result.catchError((Object _) {});
  }
}
