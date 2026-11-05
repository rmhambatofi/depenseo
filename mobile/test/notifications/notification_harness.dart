// Harnais des tests de notifications (P6-11, ADR-056) : faux serveur de
// `/me/notification-settings`, `/me/devices` et `dailyReminderTime` de `/me`.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

Finder byKey(String key) => find.byKey(Key(key));

/// État serveur des réglages ; défauts d'ADR-035 (tout activé, pas de plage)
/// et rappel quotidien désactivé (ADR-034).
class NotificationServer {
  NotificationServer(this.app) {
    final me = app.api.routes['GET /me']!;
    app.api
      ..on('GET /me', (req) async {
        final response = await me(req);
        return FakeResponse(200, {
          ...response.body! as Map<String, dynamic>,
          'reminderTime': '09:00',
          'dailyReminderTime': dailyReminderTime,
        });
      })
      ..on('GET /me/notification-settings', (_) {
        if (offline) throw Exception('offline');
        return FakeResponse(200, json);
      })
      ..on('PATCH /me/notification-settings', (req) {
        if (failWrites) return FakeResponse.problem(500, 'Server error');
        settings.addAll((req.body! as Map).cast<String, Object?>());
        return FakeResponse(200, json);
      })
      ..on('PATCH /me', (req) {
        if (failWrites) return FakeResponse.problem(500, 'Server error');
        dailyReminderTime = (req.body! as Map)['dailyReminderTime'] as String?;
        return const FakeResponse(200, {});
      });
  }

  final TestApp app;
  bool failWrites = false;
  bool offline = false;
  String? dailyReminderTime;
  final Map<String, Object?> settings = {
    'limit': true,
    'occurrence': true,
    'unusualExpense': true,
    'dailyReminder': true,
    'quietHours': null,
  };

  Map<String, Object?> get json => Map.of(settings);
}

Future<(TestApp, NotificationServer)> openNotifications(
  WidgetTester tester, {
  Locale locale = const Locale('fr'),
  void Function(NotificationServer server)? configure,
  Finder? until,
}) async {
  final app = await startSignedIn(tester, locale: locale);
  final server = NotificationServer(app);
  configure?.call(server);
  await tester.tap(byKey('open-settings'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(byKey('open-notifications'));
  await tester.tap(byKey('open-notifications'));
  await settle(tester, until ?? byKey('notif-limit'));
  return (app, server);
}

/// Touche puis laisse aboutir la requête.
Future<void> tapIo(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await pumpIo(tester);
}

/// Saisit [time] (`HH:MM`) dans le sélecteur d'heure ouvert par [row] et valide.
Future<void> pickTime(WidgetTester tester, Finder row, String time) async {
  // Liste paresseuse : la ligne peut ne pas être construite.
  await tester.scrollUntilVisible(
    row,
    100,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.tap(row);
  await tester.pumpAndSettle();
  final fields = find.descendant(
    of: find.byType(Dialog),
    matching: find.byType(TextField),
  );
  final parts = time.split(':');
  await tester.enterText(fields.at(0), parts[0]);
  await tester.enterText(fields.at(1), parts[1]);
  await tester.tap(find.text('OK'));
  await pumpIo(tester);
}

bool switchValue(WidgetTester tester, String key) =>
    tester.widget<SwitchListTile>(byKey(key)).value;

Finder snack(String text) => find.descendant(
  of: find.byType(SnackBar),
  matching: find.textContaining(text),
);
