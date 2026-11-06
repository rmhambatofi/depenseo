// Repères de la charte (P8-06) : cartes groupées, tuiles d'icône, titres.
import 'package:depenseo/ui/app_card.dart';
import 'package:depenseo/ui/icon_tile.dart';
import 'package:depenseo/ui/section_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Carte de la charte qui contient [of].
Finder cardOf(Finder of) =>
    find.ancestor(of: of, matching: find.byType(AppCard));

/// Tuile d'icône dans [of].
Finder iconTileIn(Finder of) =>
    find.descendant(of: of, matching: find.byType(IconTile));

/// [a] et [b] sont dans la même carte (ou non, avec [same] faux).
void expectSameCard(
  WidgetTester tester,
  Finder a,
  Finder b, {
  bool same = true,
}) {
  final ca = tester.widget<AppCard>(cardOf(a));
  final cb = tester.widget<AppCard>(cardOf(b));
  expect(identical(ca, cb), same);
}

/// Titre de section hors carte, avec son icône.
void expectSection(String title, IconData icon) {
  final header = find.widgetWithText(SectionHeader, title);
  expect(header, findsOneWidget);
  expect(cardOf(header), findsNothing);
  expect(
    find.descendant(of: header, matching: find.byIcon(icon)),
    findsOneWidget,
  );
}
