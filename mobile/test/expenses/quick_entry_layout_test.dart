// Recette visuelle (P8-08) : sur un petit téléphone, clavier ouvert à
// l'ouverture de la saisie (montant en autofocus), au moins une rangée de
// tuiles de catégorie reste visible sans défiler (F-DEP-01 : saisie en
// ≤ 3 interactions).
import 'package:depenseo/features/expenses/category_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'quick_entry_harness.dart';

void main() {
  testWidgets('petit téléphone, clavier ouvert : une rangée de catégories '
      'visible sans défiler', (tester) async {
    // iPhone SE (375×667 points), clavier + barre de suggestions ≈ 260 pt.
    const size = Size(375, 667);
    const keyboard = 260.0;
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await startSignedIn(tester);
    await openQuickEntry(tester);
    tester.view.viewInsets = const FakeViewPadding(bottom: keyboard * 2);
    await tester.pump();

    final tiles = find.byType(CategoryChoiceTile);
    expect(tiles, findsWidgets);
    final visibleBottom = size.height - keyboard;
    final visibleTop = tester.getBottomLeft(find.byType(AppBar)).dy;
    final fullyVisible = tiles.evaluate().where((e) {
      final box = e.renderObject! as RenderBox;
      final rect = box.localToGlobal(Offset.zero) & box.size;
      return rect.top >= visibleTop && rect.bottom <= visibleBottom;
    });
    expect(
      fullyVisible,
      isNotEmpty,
      reason: 'aucune tuile de catégorie au-dessus du clavier',
    );
  });
}
