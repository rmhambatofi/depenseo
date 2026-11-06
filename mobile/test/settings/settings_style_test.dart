// Réglages et compte restylés (P8-06, NF-QUA-04, docs/dev/UI.md) : sections
// titrées avec icône, lignes groupées en cartes avec tuile d'icône.
import 'package:depenseo/ui/icon_tile.dart';
import 'package:depenseo/ui/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../account/account_harness.dart';
import '../expenses/quick_entry_harness.dart';
import '../support/style_finders.dart';

Finder byKey(String key) => find.byKey(Key(key));

void main() {
  testWidgets('réglages : sections titrées, cartes groupées, tuiles et '
      'interrupteurs', (tester) async {
    final app = await startSignedIn(tester);
    app.router.go('/settings');
    await tester.pumpAndSettle();

    expectSection('Général', Icons.tune_rounded);
    expectSection('Sécurité', Icons.shield_rounded);
    expectSameCard(
      tester,
      byKey('open-categories'),
      byKey('open-notifications'),
    );
    expectSameCard(
      tester,
      byKey('open-categories'),
      byKey('lock-enabled'),
      same: false,
    );
    for (final key in [
      'open-categories',
      'open-notifications',
      'lock-enabled',
    ]) {
      expect(iconTileIn(byKey(key)), findsOneWidget, reason: key);
    }
    // L'interrupteur reste un SwitchListTile (toute la ligne est touchable).
    expect(tester.widget(byKey('lock-enabled')), isA<SwitchListTile>());

    await tester.scrollUntilVisible(
      byKey('open-account'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expectSection('Apparence', Icons.palette_rounded);
    expectSection('Compte', Icons.person_rounded);
    expect(cardOf(byKey('theme-mode')), findsOneWidget);
    expect(iconTileIn(byKey('open-account')), findsOneWidget);
  });

  testWidgets('compte : sections titrées, données groupées, suppression en '
      'rouge', (tester) async {
    await openAccount(tester);
    expectSection('Exporter mes dépenses', Icons.file_download_rounded);
    expect(cardOf(byKey('export-from')), findsOneWidget);
    expectSameCard(tester, byKey('export-from'), byKey('export-to'));
    await reveal(tester, 'delete-account');
    expectSection('Mes données', Icons.folder_rounded);
    expectSameCard(tester, byKey('export-personal'), byKey('open-legal'));
    final tile = tester.widget<IconTile>(iconTileIn(byKey('delete-account')));
    expect(tile.color, AppTokens.light.danger);
  });
}
