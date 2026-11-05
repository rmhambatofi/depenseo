// Harnais de l'écran Compte (P6-12, ADR-057) : faux serveur d'exports
// (création 202, interrogation de l'état, fichier) pour `/me/export` et
// `/notebooks/{id}/exports`.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

export '../notifications/notification_harness.dart' show byKey, snack;

/// Une route d'export : la création ajoute les routes d'état et de fichier
/// de l'identifiant tiré par l'app. [states] : réponses successives de l'état.
class ExportServer {
  ExportServer(
    this.app, {
    required String create,
    required this.base,
    this.createStatus = 202,
    List<String>? states,
    this.offline = false,
  }) : states = states ?? ['pending', 'ready'] {
    app.api.on(create, (req) {
      if (offline) throw Exception('offline');
      if (createStatus != 202) {
        return FakeResponse.problem(createStatus, 'Refused');
      }
      final body = req.body! as Map<String, dynamic>;
      final id = body['id'] as String;
      ids.add(id);
      app.api
        ..on('GET $base/$id', (_) {
          final state = this.states.length > 1
              ? this.states.removeAt(0)
              : this.states.single;
          return FakeResponse(200, {
            ...body,
            'status': state,
            'expiresAt': null,
          });
        })
        ..on('GET $base/$id/file', (_) => FakeResponse.bytes(file, mime));
      return FakeResponse(202, {
        ...body,
        'status': 'pending',
        'expiresAt': null,
      });
    });
  }

  final TestApp app;
  final String base;
  final int createStatus;
  final List<String> states;
  bool offline;
  final List<String> ids = [];
  Uint8List file = Uint8List.fromList(utf8.encode('\u{feff}date;montant\n'));
  String mime = 'text/csv; charset=utf-8';
}

Future<TestApp> openAccount(
  WidgetTester tester, {
  Locale locale = const Locale('fr'),
  String timeZone = 'Europe/Paris',
  void Function(TestApp app)? configure,
}) async {
  final app = await startSignedIn(
    tester,
    locale: locale,
    timeZone: timeZone,
    configure: configure,
  );
  await tester.tap(find.byKey(const Key('open-settings')));
  await tester.pumpAndSettle();
  // Dernière entrée d'une liste paresseuse : défiler jusqu'à elle.
  await tester.scrollUntilVisible(
    find.byKey(const Key('open-account')),
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.tap(find.byKey(const Key('open-account')));
  await settle(tester, find.byKey(const Key('export-expenses')));
  return app;
}

/// Touche [key] (rendu visible au besoin) puis laisse aboutir les requêtes
/// jusqu'à [done].
Future<void> tapUntil(
  WidgetTester tester,
  String key,
  bool Function() done,
) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await settleUntil(tester, done);
}

/// Fait défiler la liste paresseuse de l'écran Compte jusqu'à [key].
Future<void> reveal(WidgetTester tester, String key) async {
  await tester.scrollUntilVisible(
    find.byKey(Key(key)),
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.pumpAndSettle();
}
