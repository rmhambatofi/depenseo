// Mentions obligatoires dans l'app (P6-12 ; §6 ; ADR-046/057).
import 'package:depenseo/features/account/legal_screens.dart';
import 'package:depenseo/features/account/legal_texts.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'account_harness.dart';

Future<void> openLegal(WidgetTester tester, {Locale? locale}) async {
  await openAccount(tester, locale: locale ?? const Locale('fr'));
  await reveal(tester, 'open-legal');
  await tester.tap(byKey('open-legal'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('les cinq documents obligatoires s’ouvrent', (tester) async {
    await openLegal(tester);

    const titles = {
      'legal-notice': 'Mentions légales',
      'privacy': 'Politique de confidentialité',
      'terms': 'Conditions générales d’utilisation',
      'sales': 'Conditions générales de vente',
      'accessibility': 'Déclaration d’accessibilité',
    };
    for (final MapEntry(key: slug, value: title) in titles.entries) {
      await tester.tap(byKey('legal-$slug'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(of: find.byType(AppBar), matching: find.text(title)),
        findsOneWidget,
      );
      Navigator.of(tester.element(find.byType(AppBar).last)).pop();
      await tester.pumpAndSettle();
    }
    expect(byKey('legal-licenses'), findsOneWidget);
  });

  testWidgets('mentions légales : licences SQLCipher et OpenSSL citées', (
    tester,
  ) async {
    await openLegal(tester);
    await tester.tap(byKey('legal-legal-notice'));
    await tester.pumpAndSettle();

    expect(find.textContaining('SQLCipher'), findsOneWidget);
    expect(find.textContaining('OpenSSL'), findsOneWidget);
  });

  testWidgets('confidentialité : contact et droits, en anglais aussi', (
    tester,
  ) async {
    await openLegal(tester, locale: const Locale('en'));
    await tester.tap(byKey('legal-privacy'));
    await tester.pumpAndSettle();

    expect(find.text('Privacy policy'), findsOneWidget);
    // Liste paresseuse : la dernière section n'est construite qu'au défilement.
    await tester.scrollUntilVisible(
      find.textContaining('Settings › Account'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.textContaining('Settings › Account'), findsOneWidget);
  });

  test('contenu : CGV avec prix TTC, contact données personnelles', () {
    final sales = legalText(LegalDoc.sales, 'fr').sections.map((s) => s.body);
    expect(sales.join(), contains('2,49 € TTC'));
    final privacy = legalText(LegalDoc.privacy, 'fr');
    expect(privacy.sections.map((s) => s.heading), contains('Vos droits'));
    for (final doc in LegalDoc.values) {
      expect(legalDocFromSlug(legalSlug(doc)), doc);
    }
    expect(legalDocFromSlug('inconnu'), isNull);
  });

  test('licences natives enregistrées', () async {
    registerNativeLicenses();
    final packages = await LicenseRegistry.licenses
        .expand((l) => l.packages)
        .toList();
    expect(
      packages,
      containsAll(['SQLCipher', 'OpenSSL', 'Plus Jakarta Sans']),
    );
    final font = await LicenseRegistry.licenses.firstWhere(
      (l) => l.packages.contains('Plus Jakarta Sans'),
    );
    final text = font.paragraphs.map((p) => p.text).join('\n');
    expect(text, contains('SIL Open Font License, Version 1.1'));
  });

  test('police citée dans les mentions légales', () {
    for (final language in ['fr', 'en']) {
      final notice = legalText(LegalDoc.legalNotice, language).sections;
      expect(notice.map((s) => s.body).join(), contains('Plus Jakarta Sans'));
    }
  });
}
