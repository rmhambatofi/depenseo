// Choix Clair / Auto / Sombre (P8-01, docs/dev/UI.md « Mode sombre ») :
// préférence locale de l'appareil, conservée au redémarrage et à la
// déconnexion, Auto par défaut.
import 'dart:async';

import 'package:depenseo/core/appearance/theme_preference.dart';
import 'package:depenseo/features/auth/auth_controller.dart';
import 'package:depenseo/features/settings/theme_mode_controller.dart';
import 'package:depenseo/providers.dart';
import 'package:depenseo/ui/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/memory_secure_store.dart';
import '../support/test_app.dart';

ThemeMode appThemeMode(WidgetTester tester) =>
    tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode!;

Future<void> openSettings(WidgetTester tester, TestApp app) async {
  app.router.go('/settings');
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.byKey(const Key('theme-mode')),
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.pumpAndSettle();
}

Future<void> choose(WidgetTester tester, String label) async {
  await tester.tap(
    find.descendant(
      of: find.byKey(const Key('theme-mode')),
      matching: find.text(label),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('ThemePreference (codage)', () {
    test('valeurs connues', () {
      for (final mode in ThemeMode.values) {
        expect(ThemePreference.decode(ThemePreference.encode(mode)), mode);
      }
    });

    test('absente ou illisible → Auto', () {
      expect(ThemePreference.decode(null), ThemeMode.system);
      expect(ThemePreference.decode('violet'), ThemeMode.system);
    });

    test('lecture et écriture dans le coffre', () async {
      final store = MemorySecureStore();
      final prefs = ThemePreference(store);
      expect(await prefs.load(), ThemeMode.system);
      await prefs.save(ThemeMode.dark);
      expect(store.values[ThemePreference.key], 'dark');
      expect(await ThemePreference(store).load(), ThemeMode.dark);
    });
  });

  group('ThemeModeController', () {
    test('un choix fait pendant la lecture du coffre l’emporte', () async {
      final store = _SlowStore();
      final container = ProviderContainer(
        overrides: [secureStoreProvider.overrideWithValue(store)],
      );
      addTearDown(container.dispose);
      expect(container.read(themeModeProvider), ThemeMode.system);

      final saving = container
          .read(themeModeProvider.notifier)
          .set(ThemeMode.dark);
      store.read$.complete('light'); // lecture de démarrage, arrivée après
      await saving;

      expect(container.read(themeModeProvider), ThemeMode.dark);
      expect(store.values[ThemePreference.key], 'dark');
    });

    test('valeur lue par main() : appliquée sans relire le coffre', () {
      final store = _SlowStore();
      final container = ProviderContainer(
        overrides: [
          secureStoreProvider.overrideWithValue(store),
          initialThemeModeProvider.overrideWithValue(ThemeMode.dark),
        ],
      );
      addTearDown(container.dispose);
      expect(container.read(themeModeProvider), ThemeMode.dark);
      expect(store.reads, 0);
    });
  });

  testWidgets('Auto par défaut : suit la luminosité du téléphone', (
    tester,
  ) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester);
    expect(appThemeMode(tester), ThemeMode.system);
  });

  testWidgets('choix conservé au redémarrage', (tester) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester);
    await openSettings(tester, app);

    await choose(tester, 'Sombre');
    expect(appThemeMode(tester), ThemeMode.dark);
    expect(app.store.values[ThemePreference.key], 'dark');

    // Redémarrage : nouveau conteneur, même coffre.
    final restarted = TestApp(store: app.store);
    await restarted.pump(tester);
    expect(appThemeMode(tester), ThemeMode.dark);
    await openSettings(tester, restarted);
    final selector = tester.widget<SegmentedButton<ThemeMode>>(
      find.byKey(const Key('theme-mode')),
    );
    expect(selector.selected, {ThemeMode.dark});

    await choose(tester, 'Clair');
    expect(appThemeMode(tester), ThemeMode.light);
    await choose(tester, 'Auto');
    expect(appThemeMode(tester), ThemeMode.system);
    expect(app.store.values[ThemePreference.key], 'system');
  });

  testWidgets('choix explicite plus fort que la luminosité du téléphone', (
    tester,
  ) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearAllTestValues);
    final app = TestApp();
    await app.store.write(ThemePreference.key, 'light');
    await app.signIn();
    await app.pump(tester);

    final context = tester.element(find.byType(Scaffold).first);
    expect(Theme.of(context).brightness, Brightness.light);
    expect(AppTokens.of(context), AppTokens.light);
  });

  testWidgets('choix conservé à la déconnexion (préférence de l’appareil)', (
    tester,
  ) async {
    final app = TestApp();
    await app.store.write(ThemePreference.key, 'dark');
    await app.signIn();
    await app.pump(tester);

    // Pas d'`await` : la révocation Dio n'avance qu'avec une durée simulée.
    app.container.read(authControllerProvider.notifier).logout().ignore();
    for (var i = 0; i < 5 && app.location != '/login'; i++) {
      await tester.pump(const Duration(seconds: 1));
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    }
    expect(app.location, '/login');
    expect(app.store.values[ThemePreference.key], 'dark');
    expect(appThemeMode(tester), ThemeMode.dark);
  });
}

/// Coffre dont la lecture attend [read$].
class _SlowStore extends MemorySecureStore {
  final read$ = Completer<String?>();
  var reads = 0;

  @override
  Future<String?> read(String key) {
    reads++;
    return read$.future;
  }
}
