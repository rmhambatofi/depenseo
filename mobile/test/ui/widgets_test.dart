// Widgets communs de la charte (P8-01, docs/dev/UI.md).

import 'package:depenseo/ui/amount_text.dart';
import 'package:depenseo/ui/app_card.dart';
import 'package:depenseo/ui/icon_tile.dart';
import 'package:depenseo/ui/section_header.dart';
import 'package:depenseo/ui/theme.dart';
import 'package:depenseo/ui/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> pumpIn(
  WidgetTester tester,
  Widget child, {
  Brightness brightness = Brightness.light,
}) => tester.pumpWidget(
  MaterialApp(
    theme: buildTheme(brightness),
    home: Scaffold(body: Center(child: child)),
  ),
);

BoxDecoration decorationOf(WidgetTester tester, Finder of) =>
    tester
            .widget<Container>(
              find.descendant(of: of, matching: find.byType(Container)).first,
            )
            .decoration!
        as BoxDecoration;

void main() {
  testWidgets('AmountText : chiffres tabulaires et tailles de la charte', (
    tester,
  ) async {
    await pumpIn(tester, const AmountText('1 234,56 €', size: AmountSize.hero));
    final text = tester.widget<Text>(find.text('1 234,56 €'));
    expect(
      text.style!.fontFeatures,
      contains(const FontFeature.tabularFigures()),
    );
    expect(text.style!.fontSize, 40);
    expect(AmountSize.card.fontSize, 28);
    expect(AmountSize.list.fontSize, 17);
  });

  testWidgets('AmountText : couleur imposée (dépassement)', (tester) async {
    await pumpIn(tester, const AmountText('12,00 €', color: Color(0xFF112233)));
    final text = tester.widget<Text>(find.text('12,00 €'));
    expect(text.style!.color, const Color(0xFF112233));
  });

  for (final brightness in Brightness.values) {
    testWidgets('AppCard : surface arrondie ($brightness)', (tester) async {
      await pumpIn(
        tester,
        const AppCard(key: Key('card'), child: Text('contenu')),
        brightness: brightness,
      );
      final tokens = brightness == Brightness.light
          ? AppTokens.light
          : AppTokens.dark;
      final deco = decorationOf(tester, find.byKey(const Key('card')));
      expect(deco.color, tokens.surface);
      expect(deco.borderRadius, BorderRadius.circular(AppRadius.card));
      // Ombre douce en clair seulement.
      expect(
        deco.boxShadow?.isNotEmpty ?? false,
        brightness == Brightness.light,
      );
      expect(find.text('contenu'), findsOneWidget);
    });
  }

  testWidgets('AppCard cliquable : appel et ondulation dans l’arrondi', (
    tester,
  ) async {
    var taps = 0;
    await pumpIn(
      tester,
      AppCard(onTap: () => taps++, child: const Text('ouvrir')),
    );
    await tester.tap(find.text('ouvrir'));
    expect(taps, 1);
    expect(find.byType(InkWell), findsOneWidget);
  });

  testWidgets('IconTile : fond teinté à 15 % (clair), icône saturée', (
    tester,
  ) async {
    const color = Color(0xFF0B7A59);
    await pumpIn(
      tester,
      const IconTile(key: Key('tile'), icon: Icons.home_rounded, color: color),
    );
    final deco = decorationOf(tester, find.byKey(const Key('tile')));
    expect(deco.color, color.withValues(alpha: 0.15));
    expect(deco.borderRadius, BorderRadius.circular(AppRadius.tile));
    expect(tester.widget<Icon>(find.byIcon(Icons.home_rounded)).color, color);
    expect(tester.getSize(find.byKey(const Key('tile'))), const Size(48, 48));
  });

  testWidgets('IconTile : 25 % sur fond sombre ; texte de repli (emoji)', (
    tester,
  ) async {
    const color = Color(0xFF2FD3A0);
    await pumpIn(
      tester,
      const IconTile(key: Key('tile'), fallbackText: '🛒', color: color),
      brightness: Brightness.dark,
    );
    final deco = decorationOf(tester, find.byKey(const Key('tile')));
    expect(deco.color, color.withValues(alpha: 0.25));
    expect(find.text('🛒'), findsOneWidget);
  });

  testWidgets('IconTile : décorative pour les lecteurs d’écran', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await pumpIn(
        tester,
        const IconTile(key: Key('tile'), fallbackText: 'cart'),
      );
      expect(find.bySemanticsLabel('cart'), findsNothing);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('SectionHeader : titre et lien « Voir tout »', (tester) async {
    var taps = 0;
    await pumpIn(
      tester,
      SectionHeader(
        title: 'Dernières dépenses',
        actionLabel: 'Voir tout',
        actionKey: const Key('see-all'),
        onAction: () => taps++,
      ),
    );
    final title = tester.widget<Text>(find.text('Dernières dépenses'));
    expect(title.style!.fontSize, 18);
    await tester.tap(find.byKey(const Key('see-all')));
    expect(taps, 1);
    final semantics = tester.ensureSemantics();
    try {
      expect(
        tester.getSemantics(find.text('Dernières dépenses')),
        matchesSemantics(label: 'Dernières dépenses', isHeader: true),
      );
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('SectionHeader sans action : titre seul', (tester) async {
    await pumpIn(tester, const SectionHeader(title: 'Sécurité'));
    expect(find.byType(TextButton), findsNothing);
  });

  testWidgets('thème : police embarquée et composants de la charte', (
    tester,
  ) async {
    for (final brightness in Brightness.values) {
      final theme = buildTheme(brightness);
      final tokens = theme.extension<AppTokens>()!;
      expect(theme.textTheme.bodyMedium!.fontFamily, appFontFamily);
      expect(theme.scaffoldBackgroundColor, tokens.background);
      expect(theme.colorScheme.primary, tokens.primary);
      expect(theme.colorScheme.surface, tokens.surface);
      expect(theme.colorScheme.onSurfaceVariant, tokens.textMuted);
      expect(theme.colorScheme.error, tokens.danger);
      expect(theme.cardTheme.color, tokens.surface);
      expect(
        theme.cardTheme.shape,
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
      );
      expect(theme.inputDecorationTheme.fillColor, tokens.surfaceHigh);
      expect(theme.navigationBarTheme.backgroundColor, tokens.surface);
      expect(theme.bottomSheetTheme.backgroundColor, tokens.surface);
      expect(
        theme.switchTheme.trackColor!.resolve({WidgetState.selected}),
        tokens.primary,
      );
    }
  });
}
