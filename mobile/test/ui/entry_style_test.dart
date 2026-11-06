// Saisie et parcours d'entrée restylés (P8-07, NF-QUA-04, docs/dev/UI.md) :
// montant en grand dans une carte, catégories en tuiles, connexion,
// inscription et verrouillage sous une tuile de marque en dégradé.
import 'package:depenseo/ui/amount_text.dart';
import 'package:depenseo/ui/brand_tile.dart';
import 'package:depenseo/ui/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../lock/app_lock_test.dart' show lockedApp, lockScreen;
import '../support/style_finders.dart';
import '../support/test_app.dart';

Finder byKey(String key) => find.byKey(Key(key));

void main() {
  testWidgets('saisie : montant en grand dans sa carte, catégories en tuiles '
      'dans une autre carte (F-DEP-01, F-DEP-02)', (tester) async {
    await startSignedIn(tester);
    await openQuickEntry(tester);

    final amount = byKey('expense-amount');
    expect(cardOf(amount), findsOneWidget);
    final field = tester.widget<TextField>(amount);
    expect(field.style?.fontSize, AmountSize.hero.fontSize);
    expect(
      field.style?.fontFeatures,
      contains(const FontFeature.tabularFigures()),
    );
    expect(field.textAlign, TextAlign.center);
    // Clavier numérique décimal conservé.
    expect(
      field.keyboardType,
      const TextInputType.numberWithOptions(decimal: true),
    );

    final foodTile = byKey('category-$food');
    expect(find.byType(ChoiceChip), findsNothing);
    expect(iconTileIn(foodTile), findsOneWidget);
    expect(
      find.descendant(of: foodTile, matching: find.text('Alimentation')),
      findsOneWidget,
    );
    expectSameCard(tester, amount, foodTile, same: false);
    expectSameCard(tester, foodTile, byKey('category-$transport'));
    // Date, marchand, note, étiquettes regroupés dans une troisième carte.
    expectSameCard(tester, byKey('expense-date'), byKey('expense-merchant'));
    expectSameCard(tester, byKey('expense-date'), foodTile, same: false);
  });

  testWidgets('tuile de catégorie : bouton, état sélectionné annoncé', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    try {
      await startSignedIn(tester);
      await openQuickEntry(tester);
      await tester.tap(byKey('category-$food'));
      await tester.pump();

      expect(
        tester.getSemantics(byKey('category-$food')),
        matchesSemantics(
          label: 'Alimentation',
          isButton: true,
          hasTapAction: true,
          hasSelectedState: true,
          isSelected: true,
          isInMutuallyExclusiveGroup: true,
          hasEnabledState: true,
          isEnabled: true,
        ),
      );
      expect(
        tester.getSemantics(byKey('category-$transport')),
        matchesSemantics(
          label: 'Transport',
          isButton: true,
          hasTapAction: true,
          hasSelectedState: true,
          isInMutuallyExclusiveGroup: true,
          hasEnabledState: true,
          isEnabled: true,
        ),
      );
      // La sous-catégorie apparaît sous la racine choisie, dans la même carte.
      expectSameCard(
        tester,
        byKey('category-$food'),
        byKey('category-$groceries'),
      );
    } finally {
      handle.dispose();
    }
  });

  testWidgets('connexion : tuile de marque, titre en en-tête, champs et bouton '
      'dans une carte (F-AUTH-01)', (tester) async {
    final handle = tester.ensureSemantics();
    try {
      final app = TestApp();
      await app.pump(tester);

      expect(find.byType(BrandTile), findsOneWidget);
      final title = find.text('Connexion');
      expect(title, findsOneWidget);
      expect(cardOf(title), findsNothing);
      expect(
        tester.getSemantics(title),
        matchesSemantics(label: 'Connexion', isHeader: true),
      );
      expectSameCard(tester, byKey('email'), byKey('password'));
      expectSameCard(
        tester,
        byKey('email'),
        find.widgetWithText(FilledButton, 'Se connecter'),
      );
      // Lien d'inscription hors de la carte du formulaire.
      expect(cardOf(find.text('Créer un compte')), findsNothing);
    } finally {
      handle.dispose();
    }
  });

  testWidgets('inscription : champs, consentement et bouton dans une carte', (
    tester,
  ) async {
    final app = TestApp();
    await app.pump(tester);
    app.router.go('/register');
    await tester.pumpAndSettle();

    expect(find.byType(BrandTile), findsOneWidget);
    expectSameCard(tester, byKey('email'), byKey('acceptTerms'));
    expectSameCard(
      tester,
      byKey('email'),
      find.widgetWithText(FilledButton, 'Créer mon compte'),
    );
  });

  testWidgets('verrouillage : tuile de marque, touches rondes teintées, '
      'points du code en couleur primaire (F-AUTH-04)', (tester) async {
    await lockedApp(tester);
    await tester.pumpAndSettle();
    expect(lockScreen, findsOneWidget);
    expect(
      find.descendant(of: lockScreen, matching: find.byType(BrandTile)),
      findsOneWidget,
    );

    final tokens = AppTokens.of(tester.element(lockScreen));
    final key = byKey('pin-key-5');
    final size = tester.getSize(key);
    expect(size.width, greaterThanOrEqualTo(64));
    expect(size.width, size.height);
    final style = tester.widget<TextButton>(key).style!;
    expect(style.shape?.resolve({}), isA<CircleBorder>());
    expect(style.backgroundColor?.resolve({}), tokens.surfaceHigh);

    await tester.tap(key);
    await tester.pump();
    final dots = tester.widgetList<Container>(
      find.descendant(of: byKey('pin-dots'), matching: find.byType(Container)),
    );
    final colors = [
      for (final d in dots) ((d.decoration! as BoxDecoration).color),
    ];
    expect(colors.first, tokens.primary);
    expect(colors.skip(1), everyElement(isNot(tokens.primary)));
  });
}
