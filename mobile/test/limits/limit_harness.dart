// Harnais des tests de l'écran des limites (P6-08, ADR-053) : faux serveur
// des routes `…/limits`, ouverture de l'écran, actions courantes.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

Finder byKey(String key) => find.byKey(Key(key));

const base = '/notebooks/$notebookId/limits';
const today = '2026-11-05';
const pastId = '0190a000-0000-7000-8000-000000000100';

Map<String, dynamic> summary({
  int? limit,
  int spent = 31000,
  String kind = 'month',
  int startDay = 1,
  String start = '2026-11-01',
  String end = '2026-11-30',
  int elapsed = 17,
}) => {
  'start': start,
  'end': end,
  'periodKind': kind,
  'startDay': startDay,
  'limitId': limit == null ? null : pastId,
  'limit': limit,
  'currency': 'EUR',
  'includeRecurring': true,
  'spent': spent,
  'remaining': limit == null ? null : limit - spent,
  'consumedPercent': limit == null ? null : spent * 100 ~/ limit,
  'elapsedDays': 5,
  'totalDays': 30,
  'elapsedPercent': elapsed,
  'otherCurrencies': <String>[],
};

Map<String, dynamic> version({
  String id = pastId,
  int? amount = 50000,
  String kind = 'month',
  int startDay = 1,
  bool includeRecurring = true,
  String effectiveDate = '2026-10-12',
  String? appliesFrom,
}) => {
  'id': id,
  'amount': amount,
  'currency': 'EUR',
  'periodKind': kind,
  'startDay': startDay,
  'includeRecurring': includeRecurring,
  'effectiveDate': effectiveDate,
  'appliesFrom': appliesFrom ?? effectiveDate,
  'createdAt': '${effectiveDate}T08:00:00.000Z',
  'updatedAt': '${effectiveDate}T08:00:00.000Z',
};

/// Faux serveur des limites : [current] et [versions] modifiables par le test.
class LimitServer {
  LimitServer(TestApp app, {required this.current, required this.versions}) {
    app.api
      ..on(
        'GET $base/current',
        (_) => FakeResponse(200, {
          'timeZone': 'Europe/Paris',
          'today': today,
          'current': current,
          'past': <Object>[],
        }),
      )
      // L'API renvoie la plus récente d'abord.
      ..on('GET $base', (_) => FakeResponse(200, versions.reversed.toList()))
      ..on('POST $base', (r) {
        final body = r.body! as Map<String, dynamic>;
        final created = {
          ...version(id: body['id'] as String, effectiveDate: today),
          ...body,
          'updatedAt': '${today}T09:00:00.000Z',
        };
        versions.add(created);
        return FakeResponse(201, created);
      });
  }

  Map<String, dynamic> current;
  final List<Map<String, dynamic>> versions;
}

Future<(TestApp, LimitServer)> openLimits(
  WidgetTester tester, {
  required Map<String, dynamic> current,
  List<Map<String, dynamic>>? versions,
  Locale locale = const Locale('fr'),
}) async {
  final app = await startSignedIn(tester, locale: locale);
  final server = LimitServer(app, current: current, versions: versions ?? []);
  await tester.tap(byKey('open-limits'));
  await settle(tester, byKey('limit-summary'));
  return (app, server);
}

Future<void> chooseStartDay(
  WidgetTester tester,
  String kind,
  String label,
) async {
  await tester.ensureVisible(byKey('limit-start-day-$kind'));
  await tester.pumpAndSettle();
  await tester.tap(byKey('limit-start-day-$kind'));
  await tester.pumpAndSettle();
  // Menu de 31 jours : faire défiler jusqu'à l'option.
  await tester.scrollUntilVisible(
    find.text(label),
    100,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> saveLimit(WidgetTester tester) async {
  // Message précédent retiré : il couvre le bouton.
  tester
      .state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger))
      .removeCurrentSnackBar();
  await tester.ensureVisible(byKey('save-limit'));
  await tester.pumpAndSettle();
  await tester.tap(byKey('save-limit'));
}

String textOf(WidgetTester tester, String key) =>
    tester.widget<Text>(byKey(key)).data!;

/// Message d'une SnackBar (et non le bandeau de jauge périmée).
Finder snack(String text) => find.descendant(
  of: find.byType(SnackBar),
  matching: find.textContaining(text),
);
