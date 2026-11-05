import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'quick_entry_harness.dart';

void main() {
  testWidgets('« + » toujours visible ; dépense enregistrée en 3 interactions '
      'et « 12.5 » en français → 1250 centimes (F-DEP-01, 02)', (tester) async {
    final app = await startSignedIn(tester);
    expect(find.byKey(const Key('add-expense')), findsOneWidget);
    await openQuickEntry(tester);

    // 1 : montant (le point est converti en virgule à l'affichage).
    await tester.enterText(find.byKey(const Key('expense-amount')), '12.5');
    await tester.pump();
    expect(find.text('12,5'), findsOneWidget);
    // 2 : catégorie.
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    // 3 : enregistrer.
    await save(tester);

    final rows = await expenses(app, tester);
    expect(rows, hasLength(1));
    final e = rows.single;
    expect(e.amount, 1250);
    expect(e.currency, 'EUR');
    expect(e.categoryId, food);
    expect(e.notebookId, notebookId);
    expect(e.date, '2026-11-05');
    expect(e.pendingSync, isTrue);
    expect(e.note, isNull);
    expect(e.merchant, isNull);
    expect(jsonDecode(e.tags), isEmpty);
    expect(e.createdAt, '2026-11-05T09:00:00.000Z');
    expect(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(e.id),
      isTrue,
      reason: 'UUID v7 tiré sur l\'appareil',
    );
    // Retour à l'accueil avec confirmation.
    expect(find.text('Dépense enregistrée.'), findsOneWidget);
    expect(find.byKey(const Key('add-expense')), findsOneWidget);
  });

  testWidgets('dernière catégorie présélectionnée : 2 interactions suffisent', (
    tester,
  ) async {
    final app = await startSignedIn(tester);
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '3');
    await tester.tap(find.byKey(const Key('category-$transport')));
    await tester.pump();
    await save(tester);

    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '4,20');
    await save(tester);

    final rows = await expenses(app, tester);
    expect(rows.map((e) => (e.amount, e.categoryId)), [
      (300, transport),
      (420, transport),
    ]);
    expect(rows.first.id, isNot(rows.last.id));
  });

  testWidgets('tous les champs (F-DEP-03) : sous-catégorie, marchand, note, '
      'étiquettes', (tester) async {
    final app = await startSignedIn(tester);
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '1 234,56');
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('category-$groceries')));
    await tester.pump();
    await tester.enterText(
      find.byKey(const Key('expense-merchant')),
      ' Marché ',
    );
    await tester.enterText(find.byKey(const Key('expense-note')), 'Fruits');
    await tester.enterText(
      find.byKey(const Key('expense-tags')),
      'bio, Vacances , vacances,,',
    );
    await save(tester);

    final e = (await expenses(app, tester)).single;
    expect(e.amount, 123456);
    expect(e.categoryId, groceries);
    expect(e.merchant, 'Marché');
    expect(e.note, 'Fruits');
    expect(jsonDecode(e.tags), ['bio', 'Vacances']);
  });

  testWidgets('catégories masquées ou supprimées non proposées', (
    tester,
  ) async {
    await startSignedIn(tester);
    await openQuickEntry(tester);
    expect(find.byKey(const Key('category-$food')), findsOneWidget);
    expect(find.byKey(const Key('category-$hiddenRoot')), findsNothing);
    expect(
      find.byKey(const Key('category-0190a000-0000-7000-8000-0000000000c1')),
      findsNothing,
    );
    expect(
      find.byKey(const Key('category-0190a000-0000-7000-8000-0000000000d0')),
      findsNothing,
    );
    // Sous-catégories visibles seulement une fois la racine choisie.
    expect(find.byKey(const Key('category-$groceries')), findsNothing);
  });

  testWidgets('saisie refusée : montant vide, nul, catégorie absente', (
    tester,
  ) async {
    final app = await startSignedIn(tester);
    await openQuickEntry(tester);
    await tester.tap(find.byKey(const Key('save-expense')));
    await tester.pumpAndSettle();
    expect(find.text('Saisissez un montant.'), findsOneWidget);
    expect(find.text('Choisissez une catégorie.'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('expense-amount')), '0');
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('save-expense')));
    await tester.pumpAndSettle();
    expect(find.text('Le montant doit être supérieur à zéro.'), findsOneWidget);
    expect(find.text('Choisissez une catégorie.'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('expense-tags')),
      List.generate(11, (i) => 't$i').join(','),
    );
    await tester.enterText(find.byKey(const Key('expense-amount')), '1');
    await tester.tap(find.byKey(const Key('save-expense')));
    await tester.pumpAndSettle();
    expect(find.text('10 étiquettes au maximum.'), findsOneWidget);
    expect(await expenses(app, tester), isEmpty);
  });

  testWidgets('en anglais, la virgule devient un point', (tester) async {
    final app = await startSignedIn(tester, locale: const Locale('en'));
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '7,5');
    await tester.pump();
    expect(find.text('7.5'), findsOneWidget);
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    await save(tester);
    expect((await expenses(app, tester)).single.amount, 750);
  });

  testWidgets('date choisie au sélecteur, gardée telle quelle (F-DEP-03)', (
    tester,
  ) async {
    final app = await startSignedIn(tester);
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '1');
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('expense-date')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(Dialog), matching: find.text('2')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(find.text('2 novembre 2026'), findsOneWidget);
    await save(tester);
    expect((await expenses(app, tester)).single.date, '2026-11-02');
  });

  testWidgets('note trop longue en unités UTF-16 (borne API) refusée', (
    tester,
  ) async {
    final app = await startSignedIn(tester);
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '1');
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    // 300 graphèmes acceptés par le champ, mais 600 unités UTF-16.
    await tester.enterText(find.byKey(const Key('expense-note')), '😀' * 300);
    await tester.tap(find.byKey(const Key('save-expense')));
    await tester.pumpAndSettle();
    expect(find.text('500 caractères au maximum.'), findsOneWidget);
    expect(await expenses(app, tester), isEmpty);
  });
}
