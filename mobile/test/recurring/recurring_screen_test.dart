// Écran des récurrences (P6-09, F-REC-02/03/04, ADR-054) : échéances en
// attente lues depuis l'API, payer / confirmer / ajuster / sauter, heure des
// rappels.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/style_finders.dart';
import 'recurring_harness.dart';

void main() {
  final rent = recurring();
  final phone = recurring(
    id: phoneId,
    name: 'Électricité',
    amount: 6500,
    amountKind: 'estimated',
    startDate: '2026-01-02',
  );

  Map<String, List<Map<String, dynamic>>> twoPending() => {
    rentId: [
      occurrence(id: paidOccId, dueDate: '2026-10-05', status: 'paid'),
      occurrence(dueDate: '2026-11-05'),
    ],
    phoneId: [
      occurrence(
        id: phoneOccId,
        recurringId: phoneId,
        name: 'Électricité',
        dueDate: '2026-11-02',
        amount: 6500,
        amountKind: 'estimated',
        awaitingConfirmation: true,
      ),
    ],
  };

  testWidgets('liste : échéances en attente par date, à confirmer, montant '
      'estimé, récurrences et heure des rappels', (tester) async {
    await openRecurring(
      tester,
      items: [phone, rent],
      occurrences: twoPending(),
    );
    final tiles = tester
        .widgetList<ListTile>(find.byType(ListTile))
        .map((t) => t.key)
        .whereType<ValueKey<String>>()
        .map((k) => k.value)
        .where((k) => k.startsWith('occurrence-'))
        .toList();
    // La payée est écartée ; la plus ancienne d'abord.
    expect(tiles, ['occurrence-$phoneOccId', 'occurrence-$rentOccId']);
    expect(find.textContaining('À confirmer'), findsOneWidget);
    expect(
      tester.widget<Text>(byKey('occurrence-amount-$phoneOccId')).data,
      matches(r'^≈ 65,00.€$'),
    );
    expect(find.textContaining('5 nov. 2026'), findsOneWidget);
    expect(byKey('recurring-$rentId'), findsOneWidget);
    expect(find.text('Chaque mois'), findsNWidgets(2));
    expect(find.text('09:00, heure locale'), findsOneWidget);
  });

  testWidgets('sections titrées, échéances et récurrences en cartes avec '
      'tuile d’icône', (tester) async {
    await openRecurring(
      tester,
      items: [phone, rent],
      occurrences: twoPending(),
    );
    expectSection('Échéances en attente', Icons.event_rounded);
    expectSameCard(
      tester,
      byKey('occurrence-$phoneOccId'),
      byKey('occurrence-$rentOccId'),
    );
    expect(iconTileIn(byKey('occurrence-$phoneOccId')), findsOneWidget);
    await tester.scrollUntilVisible(
      byKey('reminder-time'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expectSection('Récurrences', Icons.autorenew_rounded);
    expectSameCard(
      tester,
      byKey('recurring-$rentId'),
      byKey('reminder-time'),
      same: false,
    );
    expect(iconTileIn(byKey('recurring-$rentId')), findsOneWidget);
    expect(iconTileIn(byKey('reminder-time')), findsOneWidget);
  });

  testWidgets('payer : dépense créée côté API avec un identifiant client, '
      'liste rechargée', (tester) async {
    final (app, _) = await openRecurring(
      tester,
      items: [rent],
      occurrences: twoPending()..remove(phoneId),
    );
    await tester.tap(byKey('occurrence-$rentOccId'));
    await tester.pumpAndSettle();
    expect(find.text('Payer'), findsOneWidget);
    expect(byKey('occurrence-reset'), findsNothing);
    await tester.tap(byKey('occurrence-pay'));
    await settle(tester, byKey('no-occurrence'));

    final body = app.api.calls('POST $base/occurrences/$rentOccId/pay').single;
    expect((body.body! as Map).keys, ['expenseId']);
    expect((body.body! as Map)['expenseId'], matches(uuidV7));
    expect(snack('Échéance payée'), findsOneWidget);
  });

  testWidgets('confirmer une échéance « à confirmer » ; réponse perdue puis '
      'nouvel essai : même identifiant de dépense', (tester) async {
    final (app, _) = await openRecurring(
      tester,
      items: [phone],
      occurrences: twoPending()..remove(rentId),
    );
    final path = 'POST $base/occurrences/$phoneOccId/pay';
    final pay = app.api.routes[path]!;
    app.api.on(path, (_) => throw Exception('réseau'));
    await tester.tap(byKey('occurrence-$phoneOccId'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmer'), findsOneWidget);
    await tester.tap(byKey('occurrence-pay'));
    await settle(tester, snack('Connexion requise'));
    expect(byKey('occurrence-$phoneOccId'), findsOneWidget);

    app.api.on(path, pay);
    dismissSnack(tester);
    await tester.tap(byKey('occurrence-$phoneOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-pay'));
    await settle(tester, byKey('no-occurrence'));
    final ids = app.api
        .calls(path)
        .map((r) => (r.body! as Map)['expenseId'])
        .toList();
    expect(ids, hasLength(2));
    expect(ids.toSet(), hasLength(1));
  });

  testWidgets('ajuster le montant puis revenir au montant prévu', (
    tester,
  ) async {
    final (app, _) = await openRecurring(
      tester,
      items: [phone],
      occurrences: twoPending()..remove(rentId),
    );
    final path = 'PATCH $base/occurrences/$phoneOccId';
    await tester.tap(byKey('occurrence-$phoneOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-adjust'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(byKey('adjust-amount')).controller!.text,
      '65,00',
    );
    await tester.enterText(byKey('adjust-amount'), '');
    await tester.tap(byKey('confirm-adjust'));
    await tester.pumpAndSettle();
    expect(find.text('Saisissez un montant.'), findsOneWidget);
    await tester.enterText(byKey('adjust-amount'), '72,4');
    await tester.tap(byKey('confirm-adjust'));
    await settle(tester, snack('Montant ajusté'));
    expect(app.api.calls(path).single.body, {'amount': 7240});
    expect(
      tester.widget<Text>(byKey('occurrence-amount-$phoneOccId')).data,
      matches(r'^≈ 72,40.€$'),
    );

    dismissSnack(tester);
    await tester.tap(byKey('occurrence-$phoneOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-reset'));
    await settle(
      tester,
      find.byWidgetPredicate(
        (w) => w is Text && (w.data ?? '').contains('65,00'),
      ),
    );
    expect(app.api.calls(path).last.body, {'amount': null});
  });

  testWidgets('sauter : confirmation, puis échéance retirée', (tester) async {
    final (app, _) = await openRecurring(
      tester,
      items: [rent],
      occurrences: twoPending()..remove(phoneId),
    );
    final path = 'POST $base/occurrences/$rentOccId/skip';
    await tester.tap(byKey('occurrence-$rentOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-skip'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Sauter l’échéance du 5 nov'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(app.api.calls(path), isEmpty);

    await tester.tap(byKey('occurrence-$rentOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-skip'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('confirm-skip'));
    await settle(tester, byKey('no-occurrence'));
    expect(app.api.calls(path), hasLength(1));
    expect(snack('Échéance sautée'), findsOneWidget);
  });

  testWidgets('échéance déjà payée ailleurs : conflit annoncé, liste '
      'rechargée', (tester) async {
    final (app, server) = await openRecurring(
      tester,
      items: [rent],
      occurrences: twoPending()..remove(phoneId),
    );
    app.api.on('POST $base/occurrences/$rentOccId/pay', (_) {
      server.occurrences[rentId]!.last['status'] = 'paid';
      return FakeResponse.problem(409, 'Conflict');
    });
    await tester.tap(byKey('occurrence-$rentOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-pay'));
    await settle(tester, byKey('no-occurrence'));
    expect(snack('ont changé entre-temps'), findsOneWidget);
  });

  testWidgets('heure des rappels : choisie au sélecteur, envoyée à /me', (
    tester,
  ) async {
    final (app, server) = await openRecurring(tester);
    await tester.tap(byKey('reminder-time'));
    await tester.pumpAndSettle();
    // Saisie au clavier plutôt qu'au cadran.
    await tester.tap(find.byIcon(Icons.keyboard_outlined));
    await tester.pumpAndSettle();
    final fields = find.descendant(
      of: find.byType(Dialog),
      matching: find.byType(TextField),
    );
    await tester.enterText(fields.at(0), '7');
    await tester.enterText(fields.at(1), '30');
    await tester.tap(find.text('OK'));
    await settle(tester, find.text('07:30, heure locale'));
    expect(app.api.calls('PATCH /me').single.body, {'reminderTime': '07:30'});
    expect(server.reminderTime, '07:30');
  });

  testWidgets('hors ligne : message et nouvel essai', (tester) async {
    late FakeHandler list;
    final (app, _) = await openRecurring(
      tester,
      items: [rent],
      until: byKey('recurring-offline'),
      beforeOpen: (app) {
        list = app.api.routes['GET $base/recurring-expenses']!;
        app.api.on(
          'GET $base/recurring-expenses',
          (_) => FakeResponse.problem(503, 'Unavailable'),
        );
      },
    );
    expect(byKey('add-recurring'), findsNothing);

    app.api.on('GET $base/recurring-expenses', list);
    await tester.tap(byKey('recurring-retry'));
    await settle(tester, byKey('recurring-$rentId'));
  });

  testWidgets('onglet quitté puis repris : liste relue, contenu gardé '
      'pendant la lecture (P8-03)', (tester) async {
    final (app, _) = await openRecurring(tester, items: [rent]);
    final reads = app.api.calls('GET $base/recurring-expenses').length;
    // Toucher l'onglet courant ne relit rien.
    await tester.tap(byKey('open-recurring'));
    await tester.pumpAndSettle();
    expect(app.api.calls('GET $base/recurring-expenses'), hasLength(reads));

    await tester.tap(byKey('open-home'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('open-recurring'));
    await tester.pump();
    expect(byKey('recurring-$rentId'), findsOneWidget);
    await settleUntil(
      tester,
      () => app.api.calls('GET $base/recurring-expenses').length > reads,
    );
    await settle(tester, byKey('recurring-$rentId'));
  });
}
