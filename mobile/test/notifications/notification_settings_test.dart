// Réglages de notification (P6-11 ; F-NOT-01, 02, 04, 05 ; ADR-034/035/056).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/settle.dart';
import 'notification_harness.dart';

void main() {
  testWidgets(
    'défauts : types activés, rappel et plage désactivés, sans montant',
    (tester) async {
      final (app, _) = await openNotifications(tester);

      for (final key in ['notif-limit', 'notif-occurrence', 'notif-unusual']) {
        expect(switchValue(tester, key), isTrue, reason: key);
      }
      expect(switchValue(tester, 'notif-daily'), isFalse);
      expect(switchValue(tester, 'notif-quiet'), isFalse);
      expect(byKey('notif-daily-time'), findsNothing);
      expect(byKey('notif-quiet-start'), findsNothing);
      expect(
        find.text('Aucun montant n’apparaît dans les notifications.'),
        findsOneWidget,
      );
      expect(app.api.calls('GET /me/notification-settings'), hasLength(1));
    },
  );

  testWidgets('réglage par type : un interrupteur envoie son seul champ', (
    tester,
  ) async {
    final (app, server) = await openNotifications(tester);

    await tapIo(tester, byKey('notif-limit'));
    await tapIo(tester, byKey('notif-unusual'));

    expect(
      app.api.calls('PATCH /me/notification-settings').map((r) => r.body),
      [
        {'limit': false},
        {'unusualExpense': false},
      ],
    );
    expect(switchValue(tester, 'notif-limit'), isFalse);
    expect(switchValue(tester, 'notif-unusual'), isFalse);
    expect(switchValue(tester, 'notif-occurrence'), isTrue);
    expect(server.settings['limit'], isFalse);
  });

  testWidgets(
    'rappel quotidien : activé à 20:00, heure modifiable, désactivé',
    (tester) async {
      final (app, server) = await openNotifications(tester);

      await tapIo(tester, byKey('notif-daily'));
      expect(app.api.calls('PATCH /me').last.body, {
        'dailyReminderTime': '20:00',
      });
      // Type déjà activé côté serveur : pas d'écriture des réglages.
      expect(app.api.calls('PATCH /me/notification-settings'), isEmpty);
      expect(switchValue(tester, 'notif-daily'), isTrue);
      expect(
        find.descendant(
          of: byKey('notif-daily-time'),
          matching: find.text('20:00'),
        ),
        findsOneWidget,
      );

      await pickTime(tester, byKey('notif-daily-time'), '07:30');
      expect(server.dailyReminderTime, '07:30');
      expect(
        find.descendant(
          of: byKey('notif-daily-time'),
          matching: find.text('07:30'),
        ),
        findsOneWidget,
      );

      await tapIo(tester, byKey('notif-daily'));
      expect(app.api.calls('PATCH /me').last.body, {'dailyReminderTime': null});
      expect(server.dailyReminderTime, isNull);
      expect(byKey('notif-daily-time'), findsNothing);
    },
  );

  testWidgets(
    'rappel quotidien au type désactivé : réactive le type puis l’heure',
    (tester) async {
      final (app, server) = await openNotifications(
        tester,
        configure: (server) {
          server.settings['dailyReminder'] = false;
          server.dailyReminderTime = '21:15';
        },
      );
      expect(switchValue(tester, 'notif-daily'), isFalse);

      await tapIo(tester, byKey('notif-daily'));

      expect(app.api.calls('PATCH /me/notification-settings').single.body, {
        'dailyReminder': true,
      });
      // L'heure déjà choisie est conservée.
      expect(app.api.calls('PATCH /me').single.body, {
        'dailyReminderTime': '21:15',
      });
      expect(server.settings['dailyReminder'], isTrue);
      expect(switchValue(tester, 'notif-daily'), isTrue);
    },
  );

  testWidgets('plage de silence : 22:00–07:00 par défaut, bornes modifiables', (
    tester,
  ) async {
    final (app, server) = await openNotifications(tester);

    await tapIo(tester, byKey('notif-quiet'));
    expect(app.api.calls('PATCH /me/notification-settings').last.body, {
      'quietHours': {'start': '22:00', 'end': '07:00'},
    });
    expect(
      find.descendant(
        of: byKey('notif-quiet-start'),
        matching: find.text('22:00'),
      ),
      findsOneWidget,
    );

    await pickTime(tester, byKey('notif-quiet-start'), '23:30');
    expect(server.settings['quietHours'], {'start': '23:30', 'end': '07:00'});

    await pickTime(tester, byKey('notif-quiet-end'), '06:45');
    expect(server.settings['quietHours'], {'start': '23:30', 'end': '06:45'});
    expect(
      find.descendant(
        of: byKey('notif-quiet-end'),
        matching: find.text('06:45'),
      ),
      findsOneWidget,
    );

    await tapIo(tester, byKey('notif-quiet'));
    expect(app.api.calls('PATCH /me/notification-settings').last.body, {
      'quietHours': null,
    });
    expect(byKey('notif-quiet-start'), findsNothing);
  });

  testWidgets('plage de silence vide refusée sans requête', (tester) async {
    final (app, server) = await openNotifications(
      tester,
      configure: (server) =>
          server.settings['quietHours'] = {'start': '22:00', 'end': '07:00'},
    );

    await pickTime(tester, byKey('notif-quiet-end'), '22:00');

    expect(
      snack('Le début et la fin de la plage doivent être différents.'),
      findsOneWidget,
    );
    expect(app.api.calls('PATCH /me/notification-settings'), isEmpty);
    expect(server.settings['quietHours'], {'start': '22:00', 'end': '07:00'});
  });

  testWidgets('échec d’enregistrement : message, réglage inchangé', (
    tester,
  ) async {
    final (_, server) = await openNotifications(tester);
    server.failWrites = true;

    await tapIo(tester, byKey('notif-occurrence'));

    expect(snack('Enregistrement impossible'), findsOneWidget);
    expect(switchValue(tester, 'notif-occurrence'), isTrue);
    expect(server.settings['occurrence'], isTrue);
  });

  testWidgets('hors ligne au chargement : message, puis nouvel essai réussi', (
    tester,
  ) async {
    final (_, server) = await openNotifications(
      tester,
      configure: (server) => server.offline = true,
      until: byKey('notifications-retry'),
    );

    expect(
      find.text(
        'Connexion requise pour consulter ou modifier les notifications.',
      ),
      findsOneWidget,
    );
    server.offline = false;
    await tester.tap(byKey('notifications-retry'));
    await settle(tester, byKey('notif-no-amount'));
    expect(switchValue(tester, 'notif-limit'), isTrue);
  });

  testWidgets('anglais', (tester) async {
    await openNotifications(tester, locale: const Locale('en'));

    expect(find.text('Quiet hours'), findsOneWidget);
    expect(find.text('Notifications never show any amount.'), findsOneWidget);
  });

  testWidgets('écriture hors ligne : message dédié, réglage inchangé', (
    tester,
  ) async {
    final (app, _) = await openNotifications(tester);
    app.api.on(
      'PATCH /me/notification-settings',
      (_) => throw Exception('offline'),
    );

    await tapIo(tester, byKey('notif-limit'));

    expect(
      snack('Connexion requise pour consulter ou modifier les notifications.'),
      findsOneWidget,
    );
    expect(switchValue(tester, 'notif-limit'), isTrue);
  });
}
