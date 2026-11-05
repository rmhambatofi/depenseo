import 'package:depenseo/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> pumpApp(WidgetTester tester, Locale locale) async {
  await tester.pumpWidget(ProviderScope(child: DepenseoApp(locale: locale)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('accueil en français', (tester) async {
    await pumpApp(tester, const Locale('fr'));

    expect(find.text('Mes dépenses'), findsOneWidget);
  });

  testWidgets('accueil en anglais', (tester) async {
    await pumpApp(tester, const Locale('en'));

    expect(find.text('My expenses'), findsOneWidget);
  });

  testWidgets('langue non prise en charge : repli sur le français', (
    tester,
  ) async {
    await pumpApp(tester, const Locale('de'));

    expect(find.text('Mes dépenses'), findsOneWidget);
  });

  testWidgets('thèmes clair et sombre Material 3', (tester) async {
    await pumpApp(tester, const Locale('fr'));
    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.theme?.useMaterial3, isTrue);
    expect(app.darkTheme?.colorScheme.brightness, Brightness.dark);
    expect(app.themeMode, ThemeMode.system);
  });
}
