// Accessibilité des parcours clés (P7-04, NF-QUA-04, ADR-063) : cibles
// tactiles, libellés, contrastes, thème clair/sombre et texte agrandi ×2
// (un débordement de mise en page fait échouer le test).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../account/account_harness.dart' show openAccount, reveal;
import '../account/legal_pages_test.dart' show openLegal;
import '../categories/categories_screen_test.dart' show openCategories;
import '../expenses/expense_list_test.dart' show seed, openList;
import '../expenses/quick_entry_harness.dart';
import '../home/dashboard_fixture.dart';
import '../home/home_dashboard_test.dart' show openHome;
import '../limits/limit_harness.dart' show openLimits, summary;
import '../lock/app_lock_test.dart' show lockedApp, lockScreen;
import '../notifications/notification_harness.dart' show openNotifications;
import '../support/test_app.dart';

Future<void> expectGuidelines(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

/// Les règles ignorent les nœuds hors écran (et, pour les cibles tactiles,
/// ceux en partie visibles) : on fait défiler la vue principale par
/// demi-écran et on contrôle chaque position.
/// Renvoie le nombre de pas de défilement.
Future<int> expectGuidelinesWhileScrolling(WidgetTester tester) async {
  await expectGuidelines(tester);
  for (var page = 0; page < 30; page++) {
    final position = _mainScroll(tester);
    if (position == null || position.pixels >= position.maxScrollExtent) {
      return page;
    }
    position.jumpTo(
      (position.pixels + position.viewportDimension / 2).clamp(
        0,
        position.maxScrollExtent,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await expectGuidelines(tester);
  }
  fail('défilement sans fin');
}

/// Plus grande vue défilante verticale de la page affichée.
ScrollPosition? _mainScroll(WidgetTester tester) {
  ScrollPosition? best;
  for (final state in tester.stateList<ScrollableState>(
    find.byType(Scrollable).hitTestable(),
  )) {
    final p = state.position;
    if (state.axisDirection != AxisDirection.down || !p.hasContentDimensions) {
      continue;
    }
    if (best == null || p.viewportDimension > best.viewportDimension) best = p;
  }
  return best;
}

/// Parcours clés (cahier des charges §3) ; chacun laisse l'écran visé affiché.
final journeys = <String, Future<void> Function(WidgetTester)>{
  'connexion': (tester) async {
    final app = TestApp();
    await app.pump(tester);
    expect(app.location, '/login');
  },
  'inscription': (tester) async {
    final app = TestApp();
    await app.pump(tester);
    await tap(tester, find.text('Créer un compte'));
    // `context.push` : `location` garde l'URI de base, viser l'écran.
    expect(find.byKey(const Key('acceptTerms')), findsOneWidget);
  },
  'accueil': (tester) async {
    await openHome(tester, body: dashboard());
  },
  'saisie rapide': (tester) async {
    await startSignedIn(tester);
    await openQuickEntry(tester);
  },
  'liste des dépenses': (tester) async {
    final app = await startSignedIn(tester);
    await seed(app, tester);
    await openList(tester);
  },
  'limite (sans limite)': (tester) async {
    await openLimits(tester, current: summary());
  },
  'limite fixée': (tester) async {
    await openLimits(tester, current: summary(limit: 60000));
  },
  'alertes et rappels': (tester) async {
    await openNotifications(tester);
  },
  'modification de catégorie (icônes)': (tester) async {
    await openCategories(tester);
    // Emoji hors catalogue : tuile « Icône actuelle » en tête de grille.
    await tester.tap(find.byKey(const Key('category-tile-$groceries')));
    await pumpIo(tester, until: find.byKey(const Key('icon-custom')));
  },
  'réglages et apparence': (tester) async {
    final app = await startSignedIn(tester);
    // Haut de l'écran : le test défile lui-même jusqu'au choix du thème.
    app.router.go('/settings');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('open-categories')), findsOneWidget);
  },
  'compte et export': (tester) async {
    await openAccount(tester);
  },
  'déclaration d’accessibilité': (tester) async {
    await openLegal(tester);
    await reveal(tester, 'legal-accessibility');
    await tester.tap(find.byKey(const Key('legal-accessibility')));
    await tester.pumpAndSettle();
    expect(find.text('Déclaration d’accessibilité'), findsWidgets);
  },
  'verrouillage': (tester) async {
    await lockedApp(tester);
    expect(lockScreen, findsOneWidget);
  },
};

const longScreens = {
  'accueil',
  'compte et export',
  'alertes et rappels',
  'réglages et apparence',
  'modification de catégorie (icônes)',
};

/// Laisse aboutir les requêtes Dio encore en vol (minuteur zéro avancé
/// par une durée simulée, réponse par de vraies E/S) : sinon « Timer still
/// pending » quand la suite complète ralentit.
Future<void> _drainRequests(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 10));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
  }
}

void main() {
  for (final MapEntry(key: name, value: open) in journeys.entries) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        final variant = '${dark ? 'sombre' : 'clair'}, texte ×$scale';
        testWidgets('$name ($variant)', (tester) async {
          // Téléphone courant (390×844 points).
          tester.view.physicalSize = const Size(1170, 2532);
          tester.view.devicePixelRatio = 3;
          tester.platformDispatcher.platformBrightnessTestValue = dark
              ? Brightness.dark
              : Brightness.light;
          tester.platformDispatcher.textScaleFactorTestValue = scale;
          addTearDown(tester.view.reset);
          addTearDown(tester.platformDispatcher.clearAllTestValues);
          final semantics = tester.ensureSemantics();
          // Pas d'`addTearDown` : la poignée est vérifiée avant les teardowns.
          try {
            await open(tester);
            final pages = await expectGuidelinesWhileScrolling(tester);
            // Témoin : ces écrans dépassent la hauteur à texte ×2 ; un
            // `_mainScroll` cassé ne doit pas passer en silence.
            if (scale == 2.0 && longScreens.contains(name)) {
              expect(pages, greaterThan(0));
            }
            await _drainRequests(tester);
          } finally {
            semantics.dispose();
          }
        });
      }
    }
  }

  testWidgets(
    'jauge de limite : libellé annoncé, dépassement lu dans le texte',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        await openLimits(tester, current: summary(limit: 20000));
        // 310 € dépensés sur 200 € : barre pleine, dépassement lu dans le texte.
        final node = tester.getSemantics(find.byType(LinearProgressIndicator));
        expect(node.label, contains('Part de la limite consommée'));
        expect(node.label, contains('Limite dépassée de 110,00'));
        expect(node.value, '100');
      } finally {
        semantics.dispose();
      }
    },
  );
}
