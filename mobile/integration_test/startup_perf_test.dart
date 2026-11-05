// Démarrage jusqu'à l'accueil (NF-PERF-01, P7-06, ADR-065) : application complète (base
// SQLCipher réelle, Riverpod, routeur, verrou, accueil) avec une session ouverte et une API
// simulée qui répond sans délai. Mesure le coût côté appareil, réseau exclu ; résultats dans
// `docs/dev/PERF.md` (`startup_ms`, frise `startup_timeline`).
//
// Simulateur : `flutter test integration_test/startup_perf_test.dart -d <id>` (debug, JIT :
// valeur indicative, budget non imposé). Téléphone : `flutter drive --profile` avec le pilote
// `integration_test`, seule mesure opposable à la cible de 2 s.
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/expenses/quick_entry_harness.dart' show notebookId;
import '../test/home/dashboard_fixture.dart';
import '../test/limits/limit_harness.dart' show byKey;
import '../test/support/fake_api.dart';
import '../test/support/test_app.dart';

/// Cible NF-PERF-01 : accueil affiché en moins de 2 s.
const startupBudget = Duration(seconds: 2);

/// Abandon si l'accueil n'apparaît jamais.
const _giveUp = Duration(seconds: 30);

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets("de l'ouverture à l'accueil affiché", (tester) async {
    final app = TestApp();
    app.api
      ..on(
        'GET /me',
        (_) => const FakeResponse(200, {
          'id': '0190a000-0000-7000-8000-0000000000aa',
          'email': 'a@example.org',
          'language': 'fr',
          'timeZone': 'Europe/Paris',
          'currency': 'EUR',
        }),
      )
      ..on(
        'GET /notebooks',
        (_) => const FakeResponse(200, [
          {
            'id': notebookId,
            'name': 'Perso',
            'kind': 'personal',
            'role': 'owner',
          },
        ]),
      )
      ..on('GET $dashboardPath', (_) => FakeResponse(200, dashboard()));
    await app.signIn();

    final home = byKey('limit-summary');
    final stopwatch = Stopwatch();
    await binding.traceAction(() async {
      stopwatch.start();
      await app.pump(tester, settleAfter: false);
      // Vraies E/S (base, coffre) hors horloge simulée, une trame toutes les 5 ms.
      while (home.evaluate().isEmpty && stopwatch.elapsed < _giveUp) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 5)),
        );
        await tester.pump();
      }
      stopwatch.stop();
    }, reportKey: 'startup_timeline');

    expect(home, findsOneWidget);
    final ms = stopwatch.elapsedMilliseconds;
    binding.reportData = {...?binding.reportData, 'startup_ms': ms};
    debugPrint('startup_ms=$ms (${kDebugMode ? 'debug' : 'profile/release'})');
    // En debug (JIT, assertions), la durée n'est pas représentative : relevé seulement.
    if (!kDebugMode) expect(stopwatch.elapsed, lessThan(startupBudget));
    await tester.pumpAndSettle();
  });
}
