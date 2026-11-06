// Accueil (P6-10, F-TB-01/02, ADR-055) : indicateurs lus depuis
// `GET …/dashboard`, dernières dépenses de la copie locale.
import 'dart:convert';

import 'package:depenseo/features/expenses/expense_providers.dart';
import 'package:depenseo/features/home/dashboard_providers.dart';
import 'package:depenseo/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../limits/limit_harness.dart' show byKey, textOf;
import '../recurring/recurring_harness.dart' show RecurringServer;
import '../support/fake_api.dart';
import '../support/fake_sync_server.dart';
import '../support/settle.dart';
import '../support/test_app.dart';
import '../sync/sync_flow_test.dart' show drain;
import 'dashboard_fixture.dart';

String nb(String s) => s.replaceAll(' ', ' ').replaceAll(' ', ' ');

Future<TestApp> openHome(
  WidgetTester tester, {
  Map<String, dynamic>? body,
  void Function(TestApp app)? configure,
}) async {
  final app = await startSignedIn(
    tester,
    configure: (app) {
      if (body != null) {
        app.api.on('GET $dashboardPath', (_) => FakeResponse(200, body));
      }
      configure?.call(app);
    },
  );
  // Catégories insérées après le premier affichage : relire les libellés.
  app.container.invalidate(filterCategoriesProvider);
  await pumpIo(tester);
  if (body != null) await settle(tester, byKey('limit-summary'));
  return app;
}

void main() {
  testWidgets('jauge, échéances, répartition, cumul et évolution', (
    tester,
  ) async {
    await openHome(tester, body: dashboard());

    expect(nb(textOf(tester, 'limit-spent')), '310,00 € dépensés sur 500,00 €');
    expect(nb(textOf(tester, 'limit-remaining')), contains('190,00 €'));

    final upcoming = byKey('upcoming-0190a000-0000-7000-8000-000000000e01');
    expect(
      find.descendant(of: upcoming, matching: find.text('Loyer')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: upcoming, matching: find.text('7 nov. 2026')),
      findsOneWidget,
    );

    final foodRow = byKey('category-share-$food');
    expect(
      find.descendant(of: foodRow, matching: find.text('Alimentation')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: foodRow,
        matching: find.textContaining(RegExp(r'210,00.€ · 68.%')),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byKey('category-share-$transport'),
        matching: find.text('Transport'),
      ),
      findsOneWidget,
    );

    await tester.ensureVisible(byKey('dashboard-cumulative-summary'));
    expect(
      nb(textOf(tester, 'dashboard-cumulative-summary')),
      '310,00 € à ce jour, contre 50,00 € au même jour de la période '
      'précédente.',
    );

    await tester.ensureVisible(byKey('dashboard-evolution'));
    final label = tester.getSemantics(byKey('dashboard-evolution-chart')).label;
    // Nœud fusionné avec le titre de la carte : un détail par période.
    final lines = nb(label).split('\n').where((l) => l.contains(' : '));
    expect(lines, hasLength(12));
    expect(lines.first, '1 déc. 2025 : 1 100,00 €');
    expect(lines.last, '1 nov. 2026 (en cours) : 310,00 €');
    expect(find.text('Du 1 déc. 2025 au 30 nov. 2026'), findsOneWidget);
  });

  testWidgets('sans limite, sans échéance ni dépense', (tester) async {
    await openHome(
      tester,
      body: dashboard(
        limit: null,
        spent: 0,
        upcomingItems: [],
        categories: [],
        current: [point(1, 0)],
        previous: [],
      ),
    );
    expect(byKey('limit-none'), findsOneWidget);
    expect(nb(textOf(tester, 'limit-spent')), '0,00 € dépensés sur la période');
    expect(find.text('Aucune échéance à venir.'), findsOneWidget);
    expect(find.text('Aucune dépense sur la période.'), findsOneWidget);
    await tester.ensureVisible(byKey('dashboard-cumulative-summary'));
    expect(
      nb(textOf(tester, 'dashboard-cumulative-summary')),
      '0,00 € à ce jour.',
    );
  });

  testWidgets('échéance en retard et catégorie inconnue signalées', (
    tester,
  ) async {
    await openHome(
      tester,
      body: dashboard(
        upcomingItems: [upcoming(dueDate: '2026-11-02', overdue: true)],
        categories: [
          {
            'categoryId': '0190a000-0000-7000-8000-0000000000ff',
            'total': 31000,
            'percent': 100,
          },
        ],
      ),
    );
    expect(find.text('2 nov. 2026 · En retard'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Catégorie indisponible'),
      200,
      scrollable: find
          .descendant(
            of: byKey('recent-expenses'),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('Catégorie indisponible'), findsOneWidget);
  });

  testWidgets('hors connexion : message, dépenses locales, puis réessai', (
    tester,
  ) async {
    final app = await openHome(tester);
    await settle(tester, byKey('dashboard-offline'));
    expect(byKey('limit-summary'), findsNothing);
    expect(find.text('Aucune dépense pour le moment.'), findsOneWidget);
    expect(byKey('add-expense'), findsOneWidget);

    app.api.on('GET $dashboardPath', (_) => FakeResponse(200, dashboard()));
    await tester.tap(byKey('dashboard-retry'));
    await settle(tester, byKey('limit-summary'));
    expect(byKey('dashboard-offline'), findsNothing);
  });

  testWidgets('période précédente dans une autre devise : cumul seul', (
    tester,
  ) async {
    final body = dashboard();
    final evolution = body['evolution'] as List<Map<String, dynamic>>;
    evolution[1] = {...evolution[1], 'currency': 'CHF'};
    await openHome(tester, body: body);
    await tester.ensureVisible(byKey('dashboard-cumulative-summary'));
    expect(
      nb(textOf(tester, 'dashboard-cumulative-summary')),
      '310,00 € à ce jour.',
    );
  });

  testWidgets('réponse gardée dans la base locale', (tester) async {
    final app = await openHome(tester, body: dashboard());
    final db = await database(app, tester);
    final cached = await io(
      tester,
      () => db.readMeta(dashboardCacheKey(notebookId)),
    );
    expect(jsonDecode(cached!), dashboard());
  });

  testWidgets('hors connexion : copie locale lue, signalée', (tester) async {
    final app = await openHome(tester);
    await settle(tester, byKey('dashboard-offline'));
    expect(byKey('limit-summary'), findsNothing);

    // Réponse gardée lors d'une ouverture précédente.
    final db = await database(app, tester);
    await io(
      tester,
      () =>
          db.writeMeta(dashboardCacheKey(notebookId), jsonEncode(dashboard())),
    );
    await tester.tap(byKey('dashboard-retry'));
    await settle(tester, byKey('limit-summary'));
    expect(byKey('dashboard-offline'), findsOneWidget);
    expect(nb(textOf(tester, 'limit-spent')), '310,00 € dépensés sur 500,00 €');
  });

  testWidgets('session changée pendant la requête : ni affiché ni gardé', (
    tester,
  ) async {
    final app = await openHome(
      tester,
      configure: (app) => app.api.on('GET $dashboardPath', (_) async {
        await app.container.read(accountEpochProvider).rotate();
        return FakeResponse(200, dashboard());
      }),
    );
    await settle(tester, byKey('dashboard-offline'));
    expect(byKey('limit-summary'), findsNothing);
    final db = await database(app, tester);
    expect(
      await io(tester, () => db.readMeta(dashboardCacheKey(notebookId))),
      isNull,
    );
  });

  testWidgets('rechargement en échec : indicateurs gardés et signalés', (
    tester,
  ) async {
    final app = await openHome(tester, body: dashboard());
    app.api.on('GET $dashboardPath', (_) => const FakeResponse(503, {}));
    app.container.invalidate(dashboardProvider);
    await settle(tester, byKey('dashboard-offline'));
    expect(byKey('limit-summary'), findsOneWidget);
  });

  testWidgets('réponse illisible : rien de faux affiché', (tester) async {
    final body = dashboard()..remove('cumulative');
    await openHome(
      tester,
      configure: (app) =>
          app.api.on('GET $dashboardPath', (_) => FakeResponse(200, body)),
    );
    await settle(tester, byKey('dashboard-offline'));
    expect(byKey('limit-summary'), findsNothing);
  });

  testWidgets('synchro en échec : tableau de bord non relu', (tester) async {
    late TestApp started;
    started = await openHome(
      tester,
      body: dashboard(),
      configure: (app) {
        app
          ..syncEnabled = true
          ..syncRetryDelays = const []
          ..api.on(
            'GET /notebooks/$notebookId/sync',
            (_) => const FakeResponse(503, {}),
          );
      },
    );
    await drain(tester, started);
    expect(started.api.calls('GET /notebooks/$notebookId/sync'), isNotEmpty);
    expect(started.api.calls('GET $dashboardPath'), hasLength(1));
  });

  testWidgets('relu après une synchro réussie', (tester) async {
    late TestApp started;
    started = await openHome(
      tester,
      body: dashboard(),
      configure: (app) {
        app
          ..syncEnabled = true
          ..syncRetryDelays = const [];
        FakeSyncServer(app.api, notebookId, now: () => started.clock.now);
      },
    );
    await drain(tester, started);
    final syncs = started.api.calls('GET /notebooks/$notebookId/sync');
    expect(syncs, isNotEmpty);
    expect(started.api.calls('GET $dashboardPath').length, greaterThan(1));
  });

  testWidgets('échéance touchée : onglet Récurrentes ouvert (P8-03)', (
    tester,
  ) async {
    final app = await openHome(tester, body: dashboard());
    // Après le démarrage : `startSignedIn` remplace `GET /me`.
    RecurringServer(app, items: [], occurrences: {});
    final upcoming = byKey('upcoming-0190a000-0000-7000-8000-000000000e01');
    await tester.ensureVisible(upcoming);
    await tester.pumpAndSettle();
    await tester.tap(upcoming);
    await settle(tester, byKey('reminder-time'));
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      4,
    );
  });
}
