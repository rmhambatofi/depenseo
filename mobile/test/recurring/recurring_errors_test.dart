// Récurrences (P6-09, ADR-054) : session changée, rechargement en échec,
// écran fermé pendant une écriture.
import 'dart:async';

import 'package:depenseo/core/account/account_epoch.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../expenses/quick_entry_harness.dart' show food;
import '../support/settle.dart';
import 'recurring_harness.dart';

void main() {
  Map<String, List<Map<String, dynamic>>> pending() => {
    rentId: [occurrence()],
  };

  testWidgets('autre session pendant le paiement : aucun succès annoncé', (
    tester,
  ) async {
    final (app, server) = await openRecurring(
      tester,
      items: [recurring()],
      occurrences: pending(),
    );
    final path = 'POST $base/occurrences/$rentOccId/pay';
    final pay = app.api.routes[path]!;
    app.api.on(path, (r) async {
      await app.store.write(AccountEpoch.key, 'autre-session');
      return pay(r);
    });
    await tester.tap(byKey('occurrence-$rentOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-pay'));
    await settle(tester, snack('Connexion requise'));
    expect(find.textContaining('Échéance payée'), findsNothing);
  });

  testWidgets('autre session pendant la lecture : rien affiché', (
    tester,
  ) async {
    await openRecurring(
      tester,
      items: [recurring()],
      until: byKey('recurring-offline'),
      beforeOpen: (app) {
        final list = app.api.routes['GET $base/recurring-expenses']!;
        app.api.on('GET $base/recurring-expenses', (r) async {
          await app.store.write(AccountEpoch.key, 'autre-session');
          return list(r);
        });
      },
    );
    expect(byKey('recurring-$rentId'), findsNothing);
  });

  testWidgets('rechargement en échec après une écriture : liste signalée '
      'périmée, actions et formulaire désactivés', (tester) async {
    final (app, _) = await openRecurring(
      tester,
      items: [recurring()],
      occurrences: pending(),
    );
    app.api.on(
      'GET $base/recurring-expenses',
      (_) => throw Exception('réseau'),
    );
    await tester.tap(byKey('occurrence-$rentOccId'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('occurrence-adjust'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('adjust-amount'), '790');
    await tester.tap(byKey('confirm-adjust'));
    await settle(tester, byKey('recurring-stale'));
    expect(byKey('occurrence-$rentOccId'), findsOneWidget);
    expect(
      tester.widget<ListTile>(byKey('occurrence-$rentOccId')).enabled,
      isFalse,
    );
    expect(byKey('add-recurring'), findsNothing);

    // Formulaire ouvert sur des données peut-être périmées : lecture seule.
    GoRouter.of(tester.element(byKey('reminder-time')))
        .push('/recurring/$rentId')
        .ignore();
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(byKey('save-recurring')).onPressed,
      isNull,
    );
  });

  testWidgets('formulaire fermé pendant la création : liste rechargée, '
      'aucune erreur', (tester) async {
    final (app, _) = await openRecurring(tester);
    final create = app.api.routes['POST $base/recurring-expenses']!;
    final reply = Completer<void>();
    app.api.on('POST $base/recurring-expenses', (r) async {
      await reply.future;
      return create(r);
    });
    await tester.tap(byKey('add-recurring'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('recurring-name'), 'Box');
    await tester.enterText(byKey('recurring-amount'), '30');
    await tester.tap(byKey('category-$food'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(byKey('save-recurring'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('save-recurring'));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    reply.complete();
    await settle(tester, find.widgetWithText(ListTile, 'Box'));
    expect(tester.takeException(), isNull);
  });
}
