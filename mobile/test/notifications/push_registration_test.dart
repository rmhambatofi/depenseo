// Enregistrement de l'appareil pour les notifications push (P6-11, ADR-035/056).
import 'dart:async';

import 'package:depenseo/features/notifications/push_registration.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

const deviceId = '0190a000-0000-7000-8000-0000000000d1';
String devicePath(String id) => 'PUT /me/devices/$id';

Iterable<FakeRequest> devicePuts(TestApp app) =>
    app.api.requests.where((r) => r.key.startsWith('PUT /me/devices/'));

Future<void> waitFor(WidgetTester tester, bool Function() done) =>
    settleUntil(tester, done);

void main() {
  testWidgets(
    'démarrage connecté : jeton enregistré sous un UUID v7 conservé',
    (tester) async {
      final app = await startSignedIn(
        tester,
        configure: (app) {
          // Identifiant inconnu d'avance : la route répond 404, la requête suffit.
          app.push.token = 'fcm-token';
        },
      );
      await waitFor(tester, () => devicePuts(app).isNotEmpty);

      final put = devicePuts(app).single;
      final id = await app.store.read(deviceIdKey);
      expect(id, matches(uuidV7));
      expect(put.path, '/me/devices/$id');
      expect(put.body, {'platform': 'android', 'token': 'fcm-token'});
      expect(put.authorization, 'Bearer access');
      expect(app.push.requests, 1);
    },
  );

  testWidgets('identifiant existant réutilisé ; nouveau jeton réenregistré', (
    tester,
  ) async {
    final app = await startSignedIn(
      tester,
      configure: (app) {
        app.store.write(deviceIdKey, deviceId);
        app.push.token = 'fcm-token';
        app.api.on(devicePath(deviceId), (_) => const FakeResponse(204));
      },
    );
    await waitFor(tester, () => devicePuts(app).isNotEmpty);

    app.push.refreshes.add('fcm-token-2');
    await waitFor(tester, () => devicePuts(app).length == 2);

    expect(devicePuts(app).map((r) => r.path).toSet(), {
      '/me/devices/$deviceId',
    });
    expect(devicePuts(app).last.body, {
      'platform': 'android',
      'token': 'fcm-token-2',
    });
  });

  testWidgets('autorisation refusée : aucune requête', (tester) async {
    final app = await startSignedIn(tester); // jeton null = refus
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(app.push.requests, 1);
    expect(devicePuts(app), isEmpty);
    expect(await app.store.read(deviceIdKey), isNull);
  });

  testWidgets('push indisponible (sans configuration) : aucune demande', (
    tester,
  ) async {
    final app = await startSignedIn(
      tester,
      configure: (app) => app.push
        ..platform = null
        ..token = 'fcm-token',
    );
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(app.push.requests, 0);
    expect(devicePuts(app), isEmpty);
  });

  testWidgets(
    'identifiant pris par un autre compte (409) : nouvel identifiant',
    (tester) async {
      final app = await startSignedIn(
        tester,
        configure: (app) {
          app.store.write(deviceIdKey, deviceId);
          app.push.token = 'fcm-token';
          app.api.on(
            devicePath(deviceId),
            (_) => FakeResponse.problem(409, 'Conflict'),
          );
        },
      );
      await waitFor(tester, () => devicePuts(app).length == 2);

      final id = await app.store.read(deviceIdKey);
      expect(id, isNot(deviceId));
      expect(id, matches(uuidV7));
      expect(devicePuts(app).last.path, '/me/devices/$id');
    },
  );

  testWidgets('déconnexion : appareil retiré avant la révocation de session', (
    tester,
  ) async {
    final app = await startSignedIn(
      tester,
      configure: (app) {
        app.store.write(deviceIdKey, deviceId);
        app.api
          ..on('DELETE /me/devices/$deviceId', (_) => const FakeResponse(204))
          ..on('POST /auth/logout', (_) => const FakeResponse(204));
      },
    );

    await tester.tap(find.byTooltip('Se déconnecter'));
    await waitFor(tester, () => app.location == '/login');

    final keys = app.api.requests.map((r) => r.key).toList();
    final delete = keys.indexOf('DELETE /me/devices/$deviceId');
    expect(delete, isNonNegative);
    expect(delete, lessThan(keys.indexOf('POST /auth/logout')));
    expect(
      app.api.calls('DELETE /me/devices/$deviceId').single.authorization,
      'Bearer access',
    );
    expect(await app.tokens.read(), isNull);
  });

  testWidgets('déconnexion hors ligne : la session est effacée quand même', (
    tester,
  ) async {
    final app = await startSignedIn(
      tester,
      configure: (app) {
        app.store.write(deviceIdKey, deviceId);
        app.api.on(
          'DELETE /me/devices/$deviceId',
          (_) => throw Exception('offline'),
        );
      },
    );

    await tester.tap(find.byTooltip('Se déconnecter'));
    await waitFor(tester, () => app.location == '/login');

    expect(await app.tokens.read(), isNull);
  });

  testWidgets(
    'retrait sans réponse : déconnexion au plus tard après le délai',
    (tester) async {
      final app = await startSignedIn(
        tester,
        configure: (app) {
          app.store.write(deviceIdKey, deviceId);
          app.api.on(
            'DELETE /me/devices/$deviceId',
            (_) => Completer<FakeResponse>().future,
          );
        },
      );

      await tester.tap(find.byTooltip('Se déconnecter'));
      await tester.pump(unregisterTimeout + const Duration(seconds: 1));
      await waitFor(tester, () => app.location == '/login');

      expect(app.api.calls('DELETE /me/devices/$deviceId'), hasLength(1));
      expect(await app.tokens.read(), isNull);
    },
  );

  testWidgets('après déconnexion, un nouveau jeton n’est plus envoyé', (
    tester,
  ) async {
    final app = await startSignedIn(
      tester,
      configure: (app) {
        app.store.write(deviceIdKey, deviceId);
        app.push.token = 'fcm-token';
        app.api
          ..on(devicePath(deviceId), (_) => const FakeResponse(204))
          ..on('DELETE /me/devices/$deviceId', (_) => const FakeResponse(204))
          ..on('POST /auth/logout', (_) => const FakeResponse(204));
      },
    );
    await waitFor(tester, () => devicePuts(app).length == 1);

    await tester.tap(find.byTooltip('Se déconnecter'));
    await waitFor(tester, () => app.location == '/login');
    app.push.refreshes.add('fcm-token-2');
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();

    expect(devicePuts(app), hasLength(1));
  });
}
