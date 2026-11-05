import 'package:depenseo/core/lock/lock_settings.dart';
import 'package:depenseo/core/lock/lock_store.dart';
import 'package:depenseo/features/lock/app_lock_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/test_app.dart';

/// Parcours réel du cycle de vie : premier plan → arrière-plan → retour.
Future<void> toBackground(WidgetTester tester) async {
  for (final s in [
    AppLifecycleState.inactive,
    AppLifecycleState.hidden,
    AppLifecycleState.paused,
  ]) {
    tester.binding.handleAppLifecycleStateChanged(s);
  }
  await tester.pump();
}

Future<void> toForeground(WidgetTester tester) async {
  for (final s in [
    AppLifecycleState.hidden,
    AppLifecycleState.inactive,
    AppLifecycleState.resumed,
  ]) {
    tester.binding.handleAppLifecycleStateChanged(s);
  }
  await tester.pumpAndSettle();
}

Future<void> typePin(WidgetTester tester, String pin) async {
  for (final digit in pin.split('')) {
    await tester.tap(find.byKey(Key('pin-key-$digit')));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

final lockScreen = find.byKey(const Key('lock-screen'));

/// Session ouverte et code 123456 déjà réglé avec [settings].
Future<TestApp> lockedApp(
  WidgetTester tester, {
  LockSettings settings = const LockSettings(),
}) async {
  final app = TestApp();
  await app.signIn();
  final store = LockStore(app.store);
  await store.setPin('123456');
  await store.savePrefs(settings);
  await app.pump(tester);
  return app;
}

void main() {
  testWidgets('activation depuis les réglages : code saisi deux fois', (
    tester,
  ) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester);
    expect(lockScreen, findsNothing);

    await tap(tester, find.byKey(const Key('open-settings')));
    await tap(tester, find.byKey(const Key('lock-enabled')));
    await typePin(tester, '123456');
    await typePin(tester, '111111');
    expect(find.text('Les codes ne correspondent pas. Recommencez.'), findsOne);
    await typePin(tester, '123456');
    await typePin(tester, '123456');

    expect(find.text('Confirmez le code'), findsNothing);
    final toggle = tester.widget<SwitchListTile>(
      find.byKey(const Key('lock-enabled')),
    );
    expect(toggle.value, isTrue);
    expect(await LockStore(app.store).verifyPin('123456'), isTrue);
    expect(lockScreen, findsNothing, reason: 'pas de verrou juste après');

    // Délai réglable.
    await tap(tester, find.text('5 min'));
    expect((await LockStore(app.store).load()).delay, LockDelay.fiveMinutes);
  });

  testWidgets(
    'démarrage à froid avec un code : verrouillé, puis déverrouillé',
    (tester) async {
      await lockedApp(tester);
      expect(lockScreen, findsOne);
      expect(find.byKey(const Key('open-settings')), findsNothing);

      await typePin(tester, '123456');
      expect(lockScreen, findsNothing);
    },
  );

  testWidgets('délai 1 min : verrou absent à 59 s, présent à 60 s', (
    tester,
  ) async {
    final app = await lockedApp(
      tester,
      settings: const LockSettings(delay: LockDelay.oneMinute),
    );
    await typePin(tester, '123456');

    await toBackground(tester);
    app.clock.advance(const Duration(seconds: 59));
    await toForeground(tester);
    expect(lockScreen, findsNothing);

    await toBackground(tester);
    app.clock.advance(const Duration(seconds: 60));
    await toForeground(tester);
    expect(lockScreen, findsOne);
  });

  testWidgets('délai 5 min : verrou absent à 4 min 59, présent à 5 min', (
    tester,
  ) async {
    final app = await lockedApp(
      tester,
      settings: const LockSettings(delay: LockDelay.fiveMinutes),
    );
    await typePin(tester, '123456');

    await toBackground(tester);
    app.clock.advance(const Duration(minutes: 4, seconds: 59));
    await toForeground(tester);
    expect(lockScreen, findsNothing);

    await toBackground(tester);
    app.clock.advance(const Duration(minutes: 5));
    await toForeground(tester);
    expect(lockScreen, findsOne);
  });

  testWidgets('immédiat : verrouillé au moindre passage en arrière-plan', (
    tester,
  ) async {
    await lockedApp(tester);
    await typePin(tester, '123456');
    await toBackground(tester);
    await toForeground(tester);
    expect(lockScreen, findsOne);
  });

  testWidgets('horloge reculée pendant l’arrière-plan : verrouillé', (
    tester,
  ) async {
    final app = await lockedApp(
      tester,
      settings: const LockSettings(delay: LockDelay.fiveMinutes),
    );
    await typePin(tester, '123456');
    await toBackground(tester);
    app.clock.advance(const Duration(hours: -1));
    await toForeground(tester);
    expect(lockScreen, findsOne);
  });

  testWidgets('contenu masqué dès que l’app n’est plus au premier plan', (
    tester,
  ) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester);
    final cover = find.byKey(const Key('privacy-cover'));
    expect(cover, findsNothing);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(cover, findsOne);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(cover, findsNothing);
  });

  testWidgets(
    'code faux : message et essais restants ; 5 échecs → déconnexion',
    (tester) async {
      final app = await lockedApp(tester);
      await typePin(tester, '000000');
      expect(find.text('Code incorrect. 4 essais restants.'), findsOne);
      for (var i = 0; i < 4; i++) {
        await typePin(tester, '000000');
      }
      expect(app.location, '/login');
      expect(lockScreen, findsNothing);
      expect(await app.tokens.read(), isNull);
      expect((await LockStore(app.store).load()).enabled, isFalse);
    },
  );

  testWidgets('les échecs survivent à un redémarrage', (tester) async {
    final app = TestApp();
    await app.signIn();
    final store = LockStore(app.store);
    await store.setPin('123456');
    for (var i = 0; i < 4; i++) {
      await store.recordFailure();
    }
    await app.pump(tester);
    await typePin(tester, '000000');
    expect(app.location, '/login');
  });

  testWidgets('code oublié : déconnexion depuis l’écran de verrouillage', (
    tester,
  ) async {
    final app = await lockedApp(tester);
    await tap(tester, find.byKey(const Key('lock-forgot')));
    await tap(tester, find.byKey(const Key('lock-forgot-confirm')));
    expect(app.location, '/login');
    expect((await LockStore(app.store).load()).enabled, isFalse);
  });

  testWidgets('biométrie : proposée automatiquement et déverrouille', (
    tester,
  ) async {
    final app = await lockedApp(
      tester,
      settings: const LockSettings(biometrics: true),
    );
    expect(app.biometrics.prompts, 1);
    expect(lockScreen, findsNothing);

    app.biometrics.result = false;
    await toBackground(tester);
    await toForeground(tester);
    expect(app.biometrics.prompts, 2);
    expect(
      lockScreen,
      findsOne,
      reason: 'échec biométrique : le code reste exigé',
    );
    await typePin(tester, '123456');
    expect(lockScreen, findsNothing);
  });

  testWidgets('activer la biométrie exige une authentification réussie', (
    tester,
  ) async {
    final app = await lockedApp(tester);
    await typePin(tester, '123456');
    app.router.go('/settings');
    await tester.pumpAndSettle();

    app.biometrics.result = false;
    await tap(tester, find.byKey(const Key('lock-biometrics')));
    expect((await LockStore(app.store).load()).biometrics, isFalse);

    app.biometrics.result = true;
    await tap(tester, find.byKey(const Key('lock-biometrics')));
    expect((await LockStore(app.store).load()).biometrics, isTrue);
  });

  testWidgets('désactivation : plus de verrou, code effacé', (tester) async {
    final app = await lockedApp(tester);
    await typePin(tester, '123456');
    app.router.go('/settings');
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const Key('lock-enabled')));
    expect((await LockStore(app.store).load()).enabled, isFalse);
    await toBackground(tester);
    await toForeground(tester);
    expect(lockScreen, findsNothing);
  });

  testWidgets('blocage des captures : appliqué au démarrage et au réglage', (
    tester,
  ) async {
    final app = await lockedApp(
      tester,
      settings: const LockSettings(blockScreenshots: true),
    );
    expect(app.screen.secure, isTrue);
    await typePin(tester, '123456');
    app.router.go('/settings');
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const Key('lock-screenshots')));
    expect(app.screen.secure, isFalse);
    expect((await LockStore(app.store).load()).blockScreenshots, isFalse);
  });

  testWidgets('sans session, pas d’écran de verrouillage', (tester) async {
    final app = TestApp();
    await LockStore(app.store).setPin('123456');
    await app.pump(tester);
    expect(app.location, '/login');
    expect(lockScreen, findsNothing);
  });

  testWidgets('passage inactive seul (centre de contrôle) : pas de verrou', (
    tester,
  ) async {
    await lockedApp(tester);
    await typePin(tester, '123456');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(lockScreen, findsNothing);
  });

  // La garde ne dépend que de la session : ce test prouve qu'aucune image de contenu
  // ne passe entre la déconnexion et la redirection vers /login.
  testWidgets('5e échec : le contenu ne réapparaît pas avant la connexion', (
    tester,
  ) async {
    final app = await lockedApp(tester);
    for (var i = 0; i < 4; i++) {
      await typePin(tester, '000000');
    }
    for (final digit in '000000'.split('')) {
      await tester.tap(find.byKey(Key('pin-key-$digit')));
    }
    for (var i = 0; i < 20; i++) {
      await tester.pump();
      expect(find.byKey(const Key('open-settings')), findsNothing);
    }
    await tester.pumpAndSettle();
    expect(app.location, '/login');
  });

  testWidgets('bouton retour sous le verrou : consommé, pile intacte', (
    tester,
  ) async {
    final app = await lockedApp(tester);
    await typePin(tester, '123456');
    app.router.go('/settings/pin');
    await tester.pumpAndSettle();
    await toBackground(tester);
    await toForeground(tester);
    expect(lockScreen, findsOne);

    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    await typePin(tester, '123456');
    expect(find.text('Choisissez un code à 6 chiffres'), findsOne);
  });

  testWidgets('réglages concurrents : désactiver puis changer le délai', (
    tester,
  ) async {
    final app = await lockedApp(tester);
    await typePin(tester, '123456');
    final controller = app.container.read(appLockProvider.notifier);
    final disabling = controller.disable();
    final delaying = controller.setDelay(LockDelay.fiveMinutes);
    await tester.pumpAndSettle();
    await disabling;
    await delaying;
    expect(app.container.read(appLockProvider).settings.enabled, isFalse);
    await toBackground(tester);
    await toForeground(tester);
    expect(lockScreen, findsNothing);
  });

  testWidgets('déconnexion : blocage des captures levé', (tester) async {
    final app = await lockedApp(
      tester,
      settings: const LockSettings(blockScreenshots: true),
    );
    expect(app.screen.secure, isTrue);
    await tap(tester, find.byKey(const Key('lock-forgot')));
    await tap(tester, find.byKey(const Key('lock-forgot-confirm')));
    expect(app.screen.secure, isFalse);
  });
}
