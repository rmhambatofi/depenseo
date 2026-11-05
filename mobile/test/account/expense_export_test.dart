// Export des dépenses sur période (P6-12 ; F-EXP-01 ; ADR-036/040/057).
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart' show notebookId;
import '../support/settle.dart';
import 'account_harness.dart';

const _create = 'POST /notebooks/$notebookId/exports';
const _base = '/notebooks/$notebookId/exports';

void main() {
  testWidgets('CSV du mois en cours : demande, attente, fichier partagé', (
    tester,
  ) async {
    late ExportServer server;
    final app = await openAccount(
      tester,
      configure: (app) =>
          server = ExportServer(app, create: _create, base: _base),
    );

    await tapUntil(
      tester,
      'export-expenses',
      () => app.files.shared.isNotEmpty,
    );

    final body = app.api.calls(_create).single.body! as Map;
    expect(body['format'], 'csv');
    expect(body['from'], '2026-11-01');
    expect(body['to'], '2026-11-05');
    expect(body['id'], matches(uuidV7));
    expect(server.ids, [body['id']]);
    // pending → ready : deux interrogations, puis le fichier.
    expect(app.api.calls('GET $_base/${body['id']}'), hasLength(2));
    expect(app.api.calls('GET $_base/${body['id']}/file'), hasLength(1));
    final shared = app.files.shared.single;
    expect(shared.name, 'depenseo-2026-11-01-2026-11-05.csv');
    expect(shared.mime, 'text/csv');
    expect(shared.bytes, server.file);
    expect(byKey('progress-expenses'), findsNothing);
  });

  testWidgets('période par défaut calculée dans le fuseau du compte', (
    tester,
  ) async {
    // 03:00 UTC le 1er novembre = 23:00 le 31 octobre à Montréal.
    final app = await openAccount(
      tester,
      timeZone: 'America/Montreal',
      configure: (app) {
        app.clock.now = DateTime.utc(2026, 11, 1, 3);
        ExportServer(app, create: _create, base: _base);
      },
    );

    await tapUntil(
      tester,
      'export-expenses',
      () => app.files.shared.isNotEmpty,
    );

    final body = app.api.calls(_create).single.body! as Map;
    expect(body['from'], '2026-10-01');
    expect(body['to'], '2026-10-31');
  });

  testWidgets('Excel hors Premium : 403 expliqué, rien de partagé', (
    tester,
  ) async {
    final app = await openAccount(
      tester,
      configure: (app) =>
          ExportServer(app, create: _create, base: _base, createStatus: 403),
    );

    await tester.tap(find.text('Excel (Premium)'));
    await tester.pumpAndSettle();
    await tapUntil(
      tester,
      'export-expenses',
      () => snack('réservé à l’abonnement Premium').evaluate().isNotEmpty,
    );

    expect((app.api.calls(_create).single.body! as Map)['format'], 'xlsx');
    expect(app.files.shared, isEmpty);
  });

  testWidgets('Excel Premium : fichier .xlsx', (tester) async {
    late ExportServer server;
    final app = await openAccount(
      tester,
      configure: (app) => server = ExportServer(
        app,
        create: _create,
        base: _base,
        states: ['ready'],
      ),
    );
    server.mime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    await tester.tap(find.text('Excel (Premium)'));
    await tester.pumpAndSettle();
    await tapUntil(
      tester,
      'export-expenses',
      () => app.files.shared.isNotEmpty,
    );

    expect(app.files.shared.single.name, endsWith('.xlsx'));
    expect(app.files.shared.single.mime, server.mime);
  });

  testWidgets('génération en échec côté serveur : message, rien de partagé', (
    tester,
  ) async {
    final app = await openAccount(
      tester,
      configure: (app) => ExportServer(
        app,
        create: _create,
        base: _base,
        states: ['pending', 'failed'],
      ),
    );

    await tapUntil(
      tester,
      'export-expenses',
      () => snack('n’a pas pu être préparé').evaluate().isNotEmpty,
    );

    expect(app.files.shared, isEmpty);
    expect(app.api.requests.where((r) => r.path.endsWith('/file')), isEmpty);
  });

  testWidgets('toujours en attente après la dernière interrogation : échec', (
    tester,
  ) async {
    final app = await openAccount(
      tester,
      configure: (app) =>
          ExportServer(app, create: _create, base: _base, states: ['pending']),
    );

    await tapUntil(
      tester,
      'export-expenses',
      () => snack('n’a pas pu être préparé').evaluate().isNotEmpty,
    );

    expect(app.files.shared, isEmpty);
  });

  testWidgets('hors ligne : message de connexion', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) =>
          ExportServer(app, create: _create, base: _base, offline: true),
    );

    await tapUntil(
      tester,
      'export-expenses',
      () => snack('Connexion impossible').evaluate().isNotEmpty,
    );

    expect(app.files.shared, isEmpty);
  });

  testWidgets('période modifiée envoyée telle quelle', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) => ExportServer(app, create: _create, base: _base),
    );

    await pickDay(tester, 'export-from', '2');
    await pickDay(tester, 'export-to', '4');
    await tapUntil(
      tester,
      'export-expenses',
      () => app.files.shared.isNotEmpty,
    );

    final body = app.api.calls(_create).single.body! as Map;
    expect(body['from'], '2026-11-02');
    expect(body['to'], '2026-11-04');
    expect(app.files.shared.single.name, 'depenseo-2026-11-02-2026-11-04.csv');
  });

  testWidgets('début après la fin : refusé sans requête', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) => ExportServer(app, create: _create, base: _base),
    );

    await pickDay(tester, 'export-from', '4');
    await pickDay(tester, 'export-to', '3');
    await tester.tap(byKey('export-expenses'));
    await tester.pumpAndSettle();

    expect(snack('La date de début doit précéder'), findsOneWidget);
    expect(app.api.calls(_create), isEmpty);
  });
}

/// Choisit le jour [day] du mois affiché par le sélecteur ouvert par [key].
Future<void> pickDay(WidgetTester tester, String key, String day) async {
  await tester.tap(byKey(key));
  await tester.pumpAndSettle();
  await tester.tap(find.text(day));
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
}
