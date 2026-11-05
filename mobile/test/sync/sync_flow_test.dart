// Synchro déclenchée par l'app : contexte prêt, après saisie, retour au premier
// plan, nouvel essai différé ; consultation hors connexion (P6-05, NF-OFF-01).
import 'package:depenseo/features/sync/sync_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_sync_server.dart';
import '../support/test_app.dart';

const remoteId = '0190a000-0000-7000-8000-000000000e09';

Future<void> toForeground(WidgetTester tester) async {
  for (final s in [
    AppLifecycleState.inactive,
    AppLifecycleState.hidden,
    AppLifecycleState.paused,
    AppLifecycleState.hidden,
    AppLifecycleState.inactive,
    AppLifecycleState.resumed,
  ]) {
    tester.binding.handleAppLifecycleStateChanged(s);
  }
  await tester.pump();
}

/// Laisse aboutir la synchro (E/S réelles de la base, minuteur zéro de Dio
/// qui exige un temps simulé non nul) jusqu'à ce qu'elle soit au repos.
Future<void> drain(WidgetTester tester, TestApp app) async {
  var idle = 0;
  for (var i = 0; i < 300 && (i < 30 || idle < 5); i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 5)),
    );
    await tester.pump(const Duration(milliseconds: 10));
    final phase = app.container.read(syncControllerProvider);
    idle = phase == SyncPhase.syncing ? 0 : idle + 1;
  }
  await tester.pumpAndSettle();
}

void main() {
  late FakeSyncServer server;

  Future<TestApp> start(
    WidgetTester tester, {
    List<Duration> retry = const [],
  }) async {
    late TestApp started;
    started = await startSignedIn(
      tester,
      configure: (app) {
        app
          ..syncEnabled = true
          ..syncRetryDelays = retry;
        server = FakeSyncServer(app.api, notebookId, now: () => app.clock.now)
          ..addCategory(food, 'Alimentation')
          ..putExpense(remoteId, {'amount': 4210, 'merchant': 'Boulangerie'});
        started = app;
      },
    );
    await drain(tester, started);
    expect(find.byKey(const Key('expense-$remoteId')), findsOneWidget);
    return started;
  }

  Future<void> quickSave(WidgetTester tester, String amount) async {
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), amount);
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    await save(tester);
  }

  Finder pendingIcon() => find.byIcon(Icons.cloud_upload_outlined);

  testWidgets('les dépenses du serveur sont listées à l’accueil, saisie hors '
      'ligne visible puis envoyée au retour au premier plan', (tester) async {
    final app = await start(tester);
    expect(find.textContaining('Boulangerie'), findsOneWidget);
    expect(find.textContaining('42,10'), findsOneWidget);

    server.offline = true;
    await quickSave(tester, '7,5');
    await drain(tester, app);
    expect(find.byKey(const Key('sync-offline')), findsOneWidget);
    // Consultation hors connexion : copie locale complète.
    expect(find.textContaining('7,50'), findsOneWidget);
    expect(find.textContaining('Boulangerie'), findsOneWidget);
    expect(pendingIcon(), findsOneWidget);

    server.offline = false;
    await toForeground(tester);
    await drain(tester, app);
    expect(server.expenses, hasLength(2));
    final local = await expenses(app, tester);
    expect(local.every((e) => !e.pendingSync), isTrue);
    expect(pendingIcon(), findsNothing);
    expect(find.byKey(const Key('sync-offline')), findsNothing);
  });

  testWidgets('saisie en ligne envoyée aussitôt', (tester) async {
    final app = await start(tester);
    await quickSave(tester, '3');
    await drain(tester, app);
    expect(server.expenses, hasLength(2));
  });

  testWidgets('hors ligne : nouvel essai automatique après le délai', (
    tester,
  ) async {
    final app = await start(tester, retry: const [Duration(seconds: 15)]);
    server.offline = true;
    await quickSave(tester, '9');
    await drain(tester, app);
    expect(find.byKey(const Key('sync-offline')), findsOneWidget);
    server.offline = false;

    await tester.pump(const Duration(seconds: 14));
    expect(server.expenses, hasLength(1));
    await tester.pump(const Duration(seconds: 1));
    await drain(tester, app);
    expect(server.expenses, hasLength(2));
    expect(find.byKey(const Key('sync-offline')), findsNothing);
  });

  testWidgets('demande reçue pendant un passage : un seul passage à la fois, '
      'puis un de plus', (tester) async {
    final app = await start(tester);
    final path = 'GET /notebooks/$notebookId/sync';
    final sync = app.api.routes[path]!;
    var inFlight = 0;
    var maxInFlight = 0;
    var calls = 0;
    app.api.on(path, (r) async {
      inFlight++;
      calls++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      if (calls == 1) {
        // Deux demandes pendant le passage : fusionnées en un passage de plus.
        final controller = app.container.read(syncControllerProvider.notifier);
        controller.request().ignore();
        controller.request().ignore();
      }
      final response = await sync(r);
      inFlight--;
      return response;
    });
    app.container.read(syncControllerProvider.notifier).request().ignore();
    await drain(tester, app);
    expect((calls, maxInFlight), (2, 1));
  });
}
