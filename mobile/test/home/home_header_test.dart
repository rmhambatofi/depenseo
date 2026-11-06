// Accueil restylé (P8-04, F-TB-01/02, ADR-069) : carte d'en-tête en dégradé
// avec sélecteur de période (périodes de `evolution`, aucune lue ailleurs),
// répartition en tuiles, barres arrondies, dernières dépenses avec
// « Voir tout ».
import 'package:depenseo/features/categories/category_badge.dart';
import 'package:depenseo/features/expenses/expense_providers.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../limits/limit_harness.dart' show byKey, textOf;
import 'dashboard_fixture.dart';
import 'home_dashboard_test.dart' show nb, openHome;

bool enabled(WidgetTester tester, String key) =>
    tester
        .widget<IconButton>(
          find.descendant(of: byKey(key), matching: find.byType(IconButton)),
        )
        .onPressed !=
    null;

void main() {
  testWidgets('en-tête : dépensé en grand, limite, reste et rythme', (
    tester,
  ) async {
    await openHome(tester, body: dashboard());
    final header = byKey('limit-summary');
    expect(
      find.descendant(of: header, matching: byKey('limit-spent')),
      findsOneWidget,
    );
    expect(nb(textOf(tester, 'limit-spent')), '310,00 €');
    expect(nb(textOf(tester, 'limit-amount')), contains('500,00 €'));
    expect(nb(textOf(tester, 'limit-remaining')), contains('190,00 €'));
    expect(byKey('limit-pace'), findsOneWidget);
    expect(nb(textOf(tester, 'home-period')), 'Du 1 nov. 2026 au 30 nov. 2026');
    // Période en cours : pas de suivante.
    expect(enabled(tester, 'period-next'), isFalse);
    expect(enabled(tester, 'period-previous'), isTrue);
  });

  testWidgets('sélecteur : périodes précédentes lues dans evolution', (
    tester,
  ) async {
    final body = dashboard();
    final evolution = body['evolution'] as List<Map<String, dynamic>>;
    // Valeurs de l'API volontairement sans rapport avec limite − dépensé.
    evolution[1] = {...evolution[1], 'limit': 40000, 'remaining': 12345};
    await openHome(tester, body: body);
    await tester.tap(byKey('period-previous'));
    await tester.pumpAndSettle();
    expect(nb(textOf(tester, 'home-period')), contains('1 oct. 2026'));
    expect(nb(textOf(tester, 'limit-spent')), '100,00 €');
    // Limite et reste de la période choisie, lus tels quels.
    expect(nb(textOf(tester, 'limit-amount')), 'Limite : 400,00 €');
    expect(nb(textOf(tester, 'limit-remaining')), contains('123,45 €'));
    // Rythme : seulement pour la période en cours.
    expect(byKey('limit-pace'), findsNothing);
    expect(enabled(tester, 'period-next'), isTrue);

    // Jusqu'à la plus ancienne des 12 périodes.
    for (var i = 0; i < 10; i++) {
      await tester.tap(byKey('period-previous'));
      await tester.pumpAndSettle();
    }
    expect(nb(textOf(tester, 'home-period')), contains('1 déc. 2025'));
    expect(nb(textOf(tester, 'limit-spent')), '1 100,00 €');
    expect(enabled(tester, 'period-previous'), isFalse);

    for (var i = 0; i < 11; i++) {
      await tester.tap(byKey('period-next'));
      await tester.pumpAndSettle();
    }
    expect(nb(textOf(tester, 'limit-spent')), '310,00 €');
    expect(byKey('limit-pace'), findsOneWidget);
  });

  testWidgets('sans limite : total de la période en grand', (tester) async {
    await openHome(tester, body: dashboard(limit: null, spent: 4200));
    expect(nb(textOf(tester, 'limit-spent')), '42,00 €');
    expect(byKey('limit-none'), findsOneWidget);
    expect(byKey('limit-amount'), findsNothing);
    expect(byKey('limit-remaining'), findsNothing);
  });

  testWidgets('limite dépassée signalée en texte et lue avec la jauge', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await openHome(tester, body: dashboard(spent: 62000));
      expect(
        nb(textOf(tester, 'limit-remaining')),
        'Limite dépassée de 120,00 €',
      );
      final node = tester.getSemantics(find.byType(LinearProgressIndicator));
      expect(node.label, contains('Part de la limite consommée'));
      expect(nb(node.label), contains('Limite dépassée de 120,00'));
      expect(node.value, '100');
      // Carte et sections suivantes : nœuds distincts.
      expect(node.label, isNot(contains('Loyer')));
      await tester.ensureVisible(byKey('category-share-$food'));
      await tester.pumpAndSettle();
      expect(
        tester.getSemantics(byKey('category-share-$food')).label,
        isNot(contains('Loyer')),
      );
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('en-tête : un nœud annoncé, relu au changement de période', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await openHome(tester, body: dashboard());
      final node = tester.getSemantics(byKey('home-spent'));
      expect(nb(node.label), contains('Dépensé'));
      expect(nb(node.label), contains('Du 1 nov. 2026 au 30 nov. 2026'));
      expect(nb(node.label), contains('310,00 €'));
      expect(node.flagsCollection.isHeader, isTrue);
      expect(node.flagsCollection.isLiveRegion, isTrue);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('répartition en tuiles de catégorie, barres arrondies', (
    tester,
  ) async {
    await openHome(tester, body: dashboard());
    await tester.ensureVisible(byKey('category-share-$food'));
    expect(find.text('Où va votre argent ?'), findsOneWidget);
    expect(
      find.descendant(
        of: byKey('category-share-$food'),
        matching: find.byType(CategoryIconBadge),
      ),
      findsOneWidget,
    );
    await tester.ensureVisible(byKey('dashboard-evolution'));
    final chart = tester.widget<BarChart>(find.byType(BarChart));
    final rods = chart.data.barGroups.expand((g) => g.barRods);
    expect(rods, hasLength(12));
    expect(rods.every((r) => r.borderRadius != BorderRadius.zero), isTrue);
  });

  testWidgets('dernières dépenses : carte et « Voir tout »', (tester) async {
    final app = await openHome(tester, body: dashboard());
    final db = await database(app, tester);
    for (var i = 1; i <= 7; i++) {
      await io(
        tester,
        () => db.insertLocalExpense(
          id: '0190a000-0000-7000-8000-00000000010$i',
          notebookId: notebookId,
          amount: 100 * i,
          currency: 'EUR',
          categoryId: food,
          date: '2026-11-0$i',
          now: DateTime.utc(2026, 11, 4, 8),
        ),
      );
    }
    refreshLocalExpenses(app.container.invalidate);
    await pumpIo(tester);
    final scrollable = find
        .descendant(
          of: byKey('recent-expenses'),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      byKey('home-recent'),
      200,
      scrollable: scrollable,
    );
    // Cinq au plus sur l'accueil ; le reste dans l'onglet Dépenses.
    expect(
      find.descendant(
        of: byKey('home-recent'),
        matching: find.byWidgetPredicate(
          (w) =>
              w.key is ValueKey<String> &&
              (w.key! as ValueKey<String>).value.startsWith('expense-'),
          skipOffstage: false,
        ),
        skipOffstage: false,
      ),
      findsNWidgets(5),
    );
    await tester.ensureVisible(byKey('recent-see-all'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('recent-see-all'));
    await pumpIo(tester, until: byKey('expense-search'));
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      1,
    );
  });
}
