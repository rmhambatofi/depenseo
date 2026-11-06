// Formulaire des récurrences (P6-09, F-REC-01/02/04, ADR-054) : création,
// modification des seuls champs changés, calendrier immuable, suppression.
import 'package:depenseo/features/recurring/recurring_form.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart' show food, groceries, transport;
import '../support/fake_api.dart';
import '../support/settle.dart';
import 'recurring_harness.dart';

/// Faire défiler le formulaire jusqu'au champ.
Future<void> reveal(WidgetTester tester, String key) async {
  await tester.scrollUntilVisible(
    byKey(key),
    200,
    scrollable: find
        .descendant(
          of: find.byType(RecurringForm),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

Future<void> tapField(WidgetTester tester, String key) async {
  await reveal(tester, key);
  await tester.ensureVisible(byKey(key));
  await tester.tap(byKey(key));
  await tester.pumpAndSettle();
}

Future<void> save(WidgetTester tester) async {
  await reveal(tester, 'save-recurring');
  await tester.tap(byKey('save-recurring'));
}

void main() {
  testWidgets('création : champs requis, puis corps complet avec identifiant '
      'client, retour à la liste', (tester) async {
    final (app, _) = await openRecurring(tester);
    expect(byKey('no-recurring'), findsOneWidget);
    await tester.tap(byKey('add-recurring'));
    await tester.pumpAndSettle();
    expect(find.text('5 nov. 2026'), findsOneWidget);

    await save(tester);
    await tester.pumpAndSettle();
    expect(find.text('Indiquez un nom.'), findsOneWidget);
    expect(find.text('Saisissez un montant.'), findsOneWidget);
    expect(byKey('recurring-category-error'), findsOneWidget);
    expect(app.api.calls('POST $base/recurring-expenses'), isEmpty);

    await tester.enterText(byKey('recurring-name'), '  Assurance auto ');
    await tester.enterText(byKey('recurring-amount'), '42,5');
    await tapField(tester, 'amount-kind-estimated');
    await tapField(tester, 'recurring-frequency');
    await tester.tap(find.text('Chaque trimestre').last);
    await tester.pumpAndSettle();
    await tapField(tester, 'category-$transport');
    await tapField(tester, 'recurring-mode-auto');
    // Rappel du jour J sans effet en mode automatique : masqué.
    expect(byKey('recurring-remind-due'), findsNothing);
    await tapField(tester, 'recurring-remind-3d');
    await save(tester);
    await settle(tester, find.widgetWithText(ListTile, 'Assurance auto'));

    final body = Map<String, dynamic>.of(
      app.api.calls('POST $base/recurring-expenses').single.body!
          as Map<String, dynamic>,
    );
    expect(body.remove('id'), matches(uuidV7));
    expect(body, {
      'name': 'Assurance auto',
      'amount': 4250,
      'amountKind': 'estimated',
      'categoryId': transport,
      'mode': 'auto',
      'remindThreeDaysBefore': false,
      'remindOnDueDate': true,
      'frequency': 'quarterly',
      'startDate': '2026-11-05',
    });
    expect(snack('Récurrence enregistrée'), findsOneWidget);
    expect(find.text('Chaque trimestre'), findsOneWidget);
  });

  testWidgets('création refusée (ponctuelle passée) : message, formulaire '
      'gardé', (tester) async {
    final (app, _) = await openRecurring(tester);
    app.api.on(
      'POST $base/recurring-expenses',
      (_) => FakeResponse.problem(422, 'Unprocessable'),
    );
    await tester.tap(byKey('add-recurring'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('recurring-name'), 'Cadeau');
    await tester.enterText(byKey('recurring-amount'), '30');
    await tapField(tester, 'category-$food');
    await save(tester);
    await settle(tester, snack('Refusé'));
    expect(byKey('recurring-name'), findsOneWidget);
  });

  testWidgets('modification : seuls les champs changés ; fréquence et date '
      'figées', (tester) async {
    final (app, _) = await openRecurring(tester, items: [recurring()]);
    await tester.tap(byKey('recurring-$rentId'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(byKey('recurring-amount')).controller!.text,
      '800,00',
    );
    expect(find.textContaining('ne se modifient pas'), findsOneWidget);
    expect(
      tester.widget<ListTile>(byKey('recurring-start-date')).enabled,
      isFalse,
    );
    await tapField(tester, 'recurring-frequency');
    expect(find.text('Chaque trimestre'), findsNothing);

    await tester.enterText(byKey('recurring-name'), 'Loyer appartement');
    await tapField(tester, 'category-$groceries');
    await save(tester);
    // Pas le champ du formulaire : la ligne de la liste rechargée.
    await settle(
      tester,
      find.descendant(
        of: byKey('recurring-$rentId'),
        matching: find.text('Loyer appartement'),
      ),
    );
    expect(
      app.api.calls('PATCH $base/recurring-expenses/$rentId').single.body,
      {'name': 'Loyer appartement', 'categoryId': groceries},
    );
  });

  testWidgets('modification sans changement : aucune requête', (tester) async {
    final (app, _) = await openRecurring(tester, items: [recurring()]);
    await tester.tap(byKey('recurring-$rentId'));
    await tester.pumpAndSettle();
    await save(tester);
    await tester.pumpAndSettle();
    expect(byKey('reminder-time'), findsOneWidget);
    expect(app.api.calls('PATCH $base/recurring-expenses/$rentId'), isEmpty);
  });

  testWidgets('suppression après confirmation', (tester) async {
    final (app, _) = await openRecurring(tester, items: [recurring()]);
    await tester.tap(byKey('recurring-$rentId'));
    await tester.pumpAndSettle();
    await tapField(tester, 'delete-recurring');
    expect(find.textContaining('Supprimer « Loyer »'), findsOneWidget);
    await tester.tap(byKey('confirm-delete-recurring'));
    await settle(tester, byKey('no-recurring'));
    expect(
      app.api.calls('DELETE $base/recurring-expenses/$rentId'),
      hasLength(1),
    );
    expect(snack('Récurrence supprimée'), findsOneWidget);
  });
}
