// Harnais des tests des récurrences (P6-09, ADR-054) : faux serveur des
// routes `…/recurring-expenses`, `…/occurrences` et `/me`, ouverture de
// l'écran, actions courantes.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

Finder byKey(String key) => find.byKey(Key(key));

const base = '/notebooks/$notebookId';
const rentId = '0190a000-0000-7000-8000-000000000201';
const phoneId = '0190a000-0000-7000-8000-000000000202';
const rentOccId = '0190a000-0000-7000-8000-000000000301';
const phoneOccId = '0190a000-0000-7000-8000-000000000302';
const paidOccId = '0190a000-0000-7000-8000-000000000300';

Map<String, dynamic> recurring({
  String id = rentId,
  String name = 'Loyer',
  int amount = 80000,
  String amountKind = 'fixed',
  String frequency = 'monthly',
  String startDate = '2026-01-05',
  String categoryId = food,
  String mode = 'confirm',
  bool remindThreeDaysBefore = true,
  bool remindOnDueDate = true,
}) => {
  'id': id,
  'name': name,
  'amount': amount,
  'currency': 'EUR',
  'amountKind': amountKind,
  'frequency': frequency,
  'startDate': startDate,
  'categoryId': categoryId,
  'mode': mode,
  'remindThreeDaysBefore': remindThreeDaysBefore,
  'remindOnDueDate': remindOnDueDate,
  'createdAt': '2026-01-01T08:00:00.000Z',
  'updatedAt': '2026-01-01T08:00:00.000Z',
};

Map<String, dynamic> occurrence({
  String id = rentOccId,
  String recurringId = rentId,
  String name = 'Loyer',
  String dueDate = '2026-11-05',
  String status = 'pending',
  int amount = 80000,
  bool adjusted = false,
  String amountKind = 'fixed',
  bool awaitingConfirmation = false,
}) => {
  'id': id,
  'recurringExpenseId': recurringId,
  'name': name,
  'dueDate': dueDate,
  'status': status,
  'amount': amount,
  'adjusted': adjusted,
  'currency': 'EUR',
  'amountKind': amountKind,
  'categoryId': food,
  'expenseId': null,
  'awaitingConfirmation': awaitingConfirmation,
  'createdAt': '2026-10-01T08:00:00.000Z',
  'updatedAt': '2026-10-01T08:00:00.000Z',
};

/// Faux serveur : [items] et [occurrences] (par récurrence) modifiables par
/// le test ; les écritures les mettent à jour comme l'API.
class RecurringServer {
  RecurringServer(this.app, {required this.items, required this.occurrences}) {
    app.api
      ..on(
        'GET /me',
        (_) => FakeResponse(200, {
          'id': '0190a000-0000-7000-8000-0000000000aa',
          'email': 'a@example.org',
          'language': 'fr',
          'timeZone': 'Europe/Paris',
          'currency': 'EUR',
          'reminderTime': reminderTime,
          'dailyReminderTime': null,
        }),
      )
      ..on('PATCH /me', (r) {
        reminderTime = (r.body! as Map)['reminderTime'] as String;
        return const FakeResponse(200, {});
      })
      ..on('GET $base/recurring-expenses', (_) {
        wire();
        return FakeResponse(200, items);
      })
      ..on('POST $base/recurring-expenses', (r) {
        final body = r.body! as Map<String, dynamic>;
        final created = {...recurring(), ...body, 'currency': 'EUR'};
        items.add(created);
        return FakeResponse(201, created);
      });
    wire();
  }

  final TestApp app;
  final List<Map<String, dynamic>> items;
  final Map<String, List<Map<String, dynamic>>> occurrences;
  String reminderTime = '09:00';

  Map<String, dynamic> _occ(String id) =>
      occurrences.values.expand((l) => l).firstWhere((o) => o['id'] == id);

  /// Routes par identifiant (le faux client n'a pas de paramètres de chemin).
  void wire() {
    for (final r in items) {
      final id = r['id'] as String;
      final path = '$base/recurring-expenses/$id';
      app.api
        ..on(
          'GET $path/occurrences',
          (_) => FakeResponse(200, occurrences[id] ?? const []),
        )
        ..on('PATCH $path', (req) {
          r.addAll(req.body! as Map<String, dynamic>);
          return FakeResponse(200, r);
        })
        ..on('DELETE $path', (_) {
          items.remove(r);
          occurrences.remove(id);
          return const FakeResponse(204);
        });
    }
    for (final o in occurrences.values.expand((l) => l)) {
      final id = o['id'] as String;
      final path = '$base/occurrences/$id';
      app.api
        ..on('PATCH $path', (req) {
          final amount = (req.body! as Map)['amount'] as int?;
          final r = items.firstWhere((r) => r['id'] == o['recurringExpenseId']);
          o
            ..['amount'] = amount ?? r['amount']
            ..['adjusted'] = amount != null;
          return FakeResponse(200, o);
        })
        ..on('POST $path/pay', (req) {
          _occ(id)
            ..['status'] = 'paid'
            ..['expenseId'] = (req.body! as Map)['expenseId'];
          return FakeResponse(200, o);
        })
        ..on('POST $path/skip', (_) {
          _occ(id)['status'] = 'skipped';
          return FakeResponse(200, o);
        });
    }
  }
}

Future<(TestApp, RecurringServer)> openRecurring(
  WidgetTester tester, {
  List<Map<String, dynamic>>? items,
  Map<String, List<Map<String, dynamic>>>? occurrences,
  Locale locale = const Locale('fr'),
}) async {
  final app = await startSignedIn(tester, locale: locale);
  final server = RecurringServer(
    app,
    items: items ?? [],
    occurrences: occurrences ?? {},
  );
  await tester.tap(byKey('open-settings'));
  await tester.pumpAndSettle();
  await tester.tap(byKey('open-recurring'));
  await settle(tester, byKey('reminder-time'));
  return (app, server);
}

/// Message d'une SnackBar.
Finder snack(String text) => find.descendant(
  of: find.byType(SnackBar),
  matching: find.textContaining(text),
);

void dismissSnack(WidgetTester tester) => tester
    .state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger))
    .removeCurrentSnackBar();
