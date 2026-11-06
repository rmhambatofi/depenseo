// Icônes de catégorie par clé (P8-02, F-CAT-01, ADR-069).
import 'dart:io';

import 'package:depenseo/features/categories/category_badge.dart';
import 'package:depenseo/l10n/generated/app_localizations.dart';
import 'package:depenseo/ui/category_icons.dart';
import 'package:depenseo/ui/icon_tile.dart';
import 'package:depenseo/ui/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Clés d'icône du plan par défaut de l'API (`icon: '…'` des racines).
List<String> apiPlanIconKeys() {
  final source = File('../apps/api/src/categories/default-plan.ts')
      .readAsStringSync();
  return RegExp(r"icon: '([^']+)'")
      .allMatches(source)
      .map((m) => m.group(1)!)
      .toList();
}

Future<void> pumpBadge(WidgetTester tester, String icon) => tester.pumpWidget(
  MaterialApp(
    theme: buildTheme(Brightness.light),
    home: Scaffold(
      body: Center(
        child: CategoryIconBadge(
          key: const Key('badge'),
          icon: icon,
          color: '#43A047',
        ),
      ),
    ),
  ),
);

void main() {
  test('clé du catalogue → icône Material arrondie ; autre valeur → null', () {
    expect(categoryIconFor('cart'), Icons.shopping_cart_rounded);
    expect(categoryIconFor('home'), Icons.home_rounded);
    expect(categoryIconFor('🛒'), isNull);
    expect(categoryIconFor('Cart'), isNull);
    expect(categoryIconFor(''), isNull);
  });

  test('le catalogue couvre toutes les icônes du plan par défaut de l’API', () {
    final keys = apiPlanIconKeys();
    expect(keys, hasLength(14));
    for (final key in keys) {
      expect(categoryIconKeys, contains(key), reason: key);
    }
    // Le plan vient en tête du sélecteur.
    expect(categoryIconKeys.take(keys.length), keys);
  });

  test('clés uniques, courtes (≤ 32, limite de l’API), icône par défaut au '
      'catalogue', () {
    expect(categoryIconKeys.toSet(), hasLength(categoryIconKeys.length));
    for (final key in categoryIconKeys) {
      expect(key, matches(RegExp(r'^[a-z][a-z_]*$')));
      expect(key.length, lessThanOrEqualTo(32));
    }
    expect(categoryIconKeys, contains(defaultCategoryIcon));
  });

  test('chaque clé a un nom lisible propre, en français et en anglais', () {
    for (final locale in AppLocalizations.supportedLocales) {
      final l10n = lookupAppLocalizations(locale);
      final fallback = l10n.categoryIconName('?');
      final names = {
        for (final key in categoryIconKeys) l10n.categoryIconName(key),
      };
      expect(names, hasLength(categoryIconKeys.length), reason: '$locale');
      expect(names, isNot(contains(fallback)), reason: '$locale');
    }
  });

  testWidgets('badge : clé → icône dans une tuile, emoji → texte', (
    tester,
  ) async {
    await pumpBadge(tester, 'cart');
    expect(
      find.descendant(
        of: find.byKey(const Key('badge')),
        matching: find.byIcon(Icons.shopping_cart_rounded),
      ),
      findsOneWidget,
    );
    expect(find.text('cart'), findsNothing);
    expect(find.byType(IconTile), findsOneWidget);

    await pumpBadge(tester, '🥕');
    expect(find.text('🥕'), findsOneWidget);
    expect(find.byType(Icon), findsNothing);
  });
}
