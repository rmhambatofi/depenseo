import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../limits/limit_harness.dart' as limits;
import '../support/settle.dart';

Finder byKey(String key) => find.byKey(Key(key));

/// Barre du bas visible (onglets de la coquille).
Finder get bottomBar => find.byType(NavigationBar);

void main() {
  testWidgets('barre du bas : Accueil, Dépenses, « + », Limites, Récurrentes '
      '(P8-03)', (tester) async {
    await startSignedIn(tester);
    expect(bottomBar, findsOneWidget);
    for (final key in [
      'open-home',
      'open-expenses',
      'add-expense',
      'open-limits',
      'open-recurring',
    ]) {
      expect(byKey(key), findsOneWidget, reason: key);
    }
    expect(
      find.descendant(of: bottomBar, matching: find.text('Accueil')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: bottomBar, matching: find.text('Dépenses')),
      findsOneWidget,
    );
    // Onglet actif : Accueil.
    final bar = tester.widget<NavigationBar>(bottomBar);
    expect(bar.selectedIndex, 0);
  });

  testWidgets('changement d’onglet et état conservé au retour', (tester) async {
    await startSignedIn(tester);
    await tester.tap(byKey('open-expenses'));
    await pumpIo(tester, until: byKey('expense-search'));
    expect(tester.widget<NavigationBar>(bottomBar).selectedIndex, 1);

    await tester.enterText(byKey('expense-search'), 'boulangerie');
    await pumpIo(tester);
    await tester.tap(byKey('open-home'));
    await pumpIo(tester, until: byKey('recent-expenses'));
    expect(byKey('expense-search'), findsNothing);
    expect(tester.widget<NavigationBar>(bottomBar).selectedIndex, 0);

    await tester.tap(byKey('open-expenses'));
    await pumpIo(tester, until: byKey('expense-search'));
    expect(find.text('boulangerie'), findsOneWidget);
  });

  testWidgets('« + » depuis l’onglet Dépenses : saisie plein écran en '
      '3 interactions puis retour sur l’onglet (F-DEP-01)', (tester) async {
    final app = await startSignedIn(tester);
    await tester.tap(byKey('open-expenses'));
    await pumpIo(tester, until: byKey('expense-search'));

    await openQuickEntry(tester);
    // Saisie au-dessus de la coquille : pas de barre du bas.
    expect(bottomBar, findsNothing);
    // 1 : montant ; 2 : catégorie ; 3 : enregistrer.
    await tester.enterText(byKey('expense-amount'), '12.5');
    await tester.pump();
    await tester.tap(byKey('category-$food'));
    await tester.pump();
    await save(tester);

    final rows = await expenses(app, tester);
    expect(rows.single.amount, 1250);
    expect(find.text('Dépense enregistrée.'), findsOneWidget);
    expect(byKey('expense-search'), findsOneWidget);
    expect(tester.widget<NavigationBar>(bottomBar).selectedIndex, 1);
  });

  testWidgets('avatar d’en-tête vers les réglages et le compte, '
      'sur chaque onglet', (tester) async {
    await startSignedIn(tester);
    await tester.tap(byKey('open-settings'));
    await tester.pumpAndSettle();
    expect(byKey('open-categories'), findsOneWidget);
    // Réglages au-dessus de la coquille : pas de barre du bas.
    expect(bottomBar, findsNothing);
    Navigator.of(tester.element(byKey('open-categories'))).pop();
    await tester.pumpAndSettle();

    await tester.tap(byKey('open-expenses'));
    await pumpIo(tester, until: byKey('expense-search'));
    expect(byKey('open-settings'), findsOneWidget);
  });

  testWidgets('« + » annoncé comme bouton aux lecteurs d’écran', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    try {
      await startSignedIn(tester);
      expect(
        tester.getSemantics(byKey('add-expense')),
        isSemantics(
          isButton: true,
          label: 'Ajouter une dépense',
          hasTapAction: true,
        ),
      );
    } finally {
      handle.dispose();
    }
  });

  testWidgets('retour système hors de l’Accueil : retour à l’Accueil', (
    tester,
  ) async {
    await startSignedIn(tester);
    await tester.tap(byKey('open-expenses'));
    await pumpIo(tester, until: byKey('expense-search'));
    await tester.binding.handlePopRoute();
    await pumpIo(tester, until: byKey('recent-expenses'));
    expect(tester.widget<NavigationBar>(bottomBar).selectedIndex, 0);
    expect(byKey('expense-search'), findsNothing);
  });

  testWidgets('onglet Limites quitté puis repris : jauge relue, contenu '
      'gardé pendant la lecture', (tester) async {
    final (app, _) = await limits.openLimits(
      tester,
      current: limits.summary(limit: 50000),
    );
    final path = 'GET ${limits.base}/current';
    final reads = app.api.calls(path).length;
    await tester.tap(byKey('open-limits'));
    await tester.pumpAndSettle();
    expect(app.api.calls(path), hasLength(reads));

    await tester.tap(byKey('open-home'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('open-limits'));
    await tester.pump();
    expect(byKey('limit-summary'), findsOneWidget);
    await settleUntil(tester, () => app.api.calls(path).length > reads);
    await settle(tester, byKey('limit-summary'));
  });
}
