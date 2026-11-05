import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

void main() {
  testWidgets('accueil en français (session présente)', (tester) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester);

    expect(find.text('Mes dépenses'), findsOneWidget);
  });

  testWidgets('accueil en anglais', (tester) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester, locale: const Locale('en'));

    expect(find.text('My expenses'), findsOneWidget);
  });

  testWidgets('langue non prise en charge : repli sur le français', (
    tester,
  ) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester, locale: const Locale('de'));

    expect(find.text('Mes dépenses'), findsOneWidget);
  });

  testWidgets('thèmes clair et sombre Material 3', (tester) async {
    final app = TestApp();
    await app.pump(tester);
    final material = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(material.theme?.useMaterial3, isTrue);
    expect(material.darkTheme?.colorScheme.brightness, Brightness.dark);
    expect(material.themeMode, ThemeMode.system);
  });
}
