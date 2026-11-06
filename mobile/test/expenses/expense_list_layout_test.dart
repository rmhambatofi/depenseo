// Liste des dépenses restylée (P8-05) : sélecteur de mois, groupes par jour,
// tuile de dépense. Recherche, filtres et annulation : expense_list_test.dart.
import 'package:depenseo/core/db/expense_filter.dart';
import 'package:depenseo/features/categories/category_badge.dart';
import 'package:depenseo/features/expenses/expense_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/test_app.dart';
import 'quick_entry_harness.dart';

const _nov1 = '0190a000-0000-7000-8000-000000000f01';
const _nov2 = '0190a000-0000-7000-8000-000000000f02';
const _nov3 = '0190a000-0000-7000-8000-000000000f03';
const _nov3b = '0190a000-0000-7000-8000-000000000f04';
const _oct31 = '0190a000-0000-7000-8000-000000000f05';
const _dec1 = '0190a000-0000-7000-8000-000000000f06';

Finder byKey(String key) => find.byKey(Key(key));

Future<void> _seed(WidgetTester tester, TestApp app) async {
  final db = await database(app, tester);
  final now = DateTime.utc(2026, 11, 4, 8);
  for (final (id, amount, category, date, merchant, note) in [
    (_nov1, 1250, food, '2026-11-01', 'Boulangerie', null),
    (_nov2, 4500, groceries, '2026-11-02', null, 'Énergie verte'),
    (_nov3, 300, transport, '2026-11-03', 'Métro', null),
    (_nov3b, 820, food, '2026-11-03', 'Café', 'Avec Paul'),
    (_oct31, 2000, food, '2026-10-31', 'Marché', null),
    (_dec1, 990, transport, '2026-12-01', 'Bus', null),
  ]) {
    await io(
      tester,
      () => db.insertLocalExpense(
        id: id,
        notebookId: notebookId,
        amount: amount,
        currency: 'EUR',
        categoryId: category,
        date: date,
        now: now,
        merchant: merchant,
        note: note,
      ),
    );
  }
}

Future<TestApp> _start(
  WidgetTester tester, {
  String timeZone = 'Europe/Paris',
  DateTime? now,
  String until = 'expense-$_nov1',
  Size size = const Size(800, 1400),
}) async {
  // Écran haut : les trois jours de novembre tiennent sans défilement.
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final app = await startSignedIn(
    tester,
    timeZone: timeZone,
    configure: (app) {
      if (now != null) app.clock.now = now;
    },
  );
  await _seed(tester, app);
  await tester.tap(byKey('open-expenses'));
  await pumpIo(tester, until: byKey(until));
  return app;
}

String _textOf(String key) =>
    (find
                .descendant(
                  of: byKey(key),
                  matching: find.byType(Text),
                  matchRoot: true,
                )
                .evaluate()
                .first
                .widget
            as Text)
        .data!;

Future<void> _tapAndWait(WidgetTester tester, String key, String until) async {
  await tester.tap(byKey(key));
  await pumpIo(tester, until: byKey(until));
}

double _top(WidgetTester tester, String key) =>
    tester.getTopLeft(byKey(key)).dy;

void main() {
  testWidgets('en-tête : mois courant, puis précédent et suivant', (
    tester,
  ) async {
    await _start(tester);
    expect(_textOf('expense-month'), 'novembre 2026');
    expect(byKey('expense-$_oct31'), findsNothing);
    expect(byKey('expense-$_dec1'), findsNothing);

    await _tapAndWait(tester, 'month-previous', 'expense-$_oct31');
    expect(_textOf('expense-month'), 'octobre 2026');
    expect(byKey('expense-$_nov1'), findsNothing);

    await _tapAndWait(tester, 'month-next', 'expense-$_nov1');
    await _tapAndWait(tester, 'month-next', 'expense-$_dec1');
    expect(_textOf('expense-month'), 'décembre 2026');
    expect(byKey('expense-$_nov1'), findsNothing);
  });

  for (final (tz, month, visible) in [
    ('Indian/Reunion', 'novembre 2026', _nov1),
    ('America/Montreal', 'octobre 2026', _oct31),
  ]) {
    testWidgets('mois courant dans le fuseau du compte ($tz)', (tester) async {
      await _start(
        tester,
        timeZone: tz,
        now: DateTime.utc(2026, 10, 31, 23, 30),
        until: 'expense-$visible',
      );
      expect(_textOf('expense-month'), month);
    }, tags: 'tz');
  }

  testWidgets('groupes par jour décroissants, date seule sans total', (
    tester,
  ) async {
    await _start(tester);
    final days = ['2026-11-03', '2026-11-02', '2026-11-01'];
    for (final d in days) {
      expect(byKey('expense-day-$d'), findsOneWidget);
      expect(
        find.descendant(
          of: byKey('expense-day-$d'),
          matching: find.textContaining('€'),
        ),
        findsNothing,
      );
    }
    // Aucun montant hors des tuiles (pas de total du jour ni du mois).
    expect(find.textContaining('€'), findsNWidgets(4));
    expect(_textOf('expense-day-2026-11-03'), '3 novembre 2026');
    expect(
      _top(tester, 'expense-day-2026-11-03'),
      lessThan(_top(tester, 'expense-day-2026-11-02')),
    );
    // Les deux dépenses du 3 sont sous leur en-tête, avant celui du 2.
    for (final id in [_nov3, _nov3b]) {
      expect(
        _top(tester, 'expense-$id'),
        greaterThan(_top(tester, 'expense-day-2026-11-03')),
      );
      expect(
        _top(tester, 'expense-$id'),
        lessThan(_top(tester, 'expense-day-2026-11-02')),
      );
    }
    final header = tester.getSemantics(byKey('expense-day-2026-11-03'));
    expect(header.flagsCollection.isHeader, isTrue);
  });

  testWidgets('tuile : catégorie, commerçant · note, montant, date', (
    tester,
  ) async {
    await _start(tester);
    Finder inTile(String id, Finder f) =>
        find.descendant(of: byKey('expense-$id'), matching: f);

    expect(inTile(_nov3b, find.byType(CategoryIconBadge)), findsOneWidget);
    expect(
      tester
          .widget<CategoryIconBadge>(
            inTile(_nov3b, find.byType(CategoryIconBadge)),
          )
          .color,
      '#43A047',
    );
    expect(inTile(_nov3b, find.text('Alimentation')), findsOneWidget);
    expect(inTile(_nov3b, find.text('Café · Avec Paul')), findsOneWidget);
    expect(
      inTile(_nov3b, find.textContaining(RegExp(r'^8,20.€$'))),
      findsOneWidget,
    );
    expect(inTile(_nov3b, find.text('3 nov. 2026')), findsOneWidget);
    expect(inTile(_nov2, find.text('Énergie verte')), findsOneWidget);
    expect(inTile(_nov1, find.text('Boulangerie')), findsOneWidget);

    // Lue d'un bloc par les lecteurs d'écran.
    final node = tester.getSemantics(byKey('expense-$_nov3b'));
    expect(node.label, contains('Alimentation'));
    expect(node.label, contains('Café · Avec Paul'));
    expect(node.label, isNot(contains('Métro')));
    expect(node.flagsCollection.isButton, isTrue);
    expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
  });

  testWidgets('texte ×1 sur 390 points : montant à droite, sur la ligne du '
      'nom (P8-08)', (tester) async {
    await _start(tester, size: const Size(390, 3000));
    Finder inTile(Finder f) =>
        find.descendant(of: byKey('expense-$_nov3b'), matching: f);
    final name = tester.getRect(inTile(find.text('Alimentation')));
    final amount = tester.getRect(
      inTile(find.textContaining(RegExp(r'^8,20.€$'))),
    );
    expect(amount.left, greaterThan(name.right));
    expect(amount.top, lessThan(name.bottom));
  });

  testWidgets('texte ×2 sur 390 points : nom et date entiers, montant et '
      'date sous le nom (P8-08)', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearAllTestValues);
    await _start(tester, size: const Size(390, 3000));
    Finder inTile(Finder f) =>
        find.descendant(of: byKey('expense-$_nov3b'), matching: f);

    final name = inTile(find.text('Alimentation'));
    final date = inTile(find.text('3 nov. 2026'));
    final amount = inTile(find.textContaining(RegExp(r'^8,20.€$')));
    for (final f in [name, date]) {
      expect(
        tester.renderObject<RenderParagraph>(f).didExceedMaxLines,
        isFalse,
      );
    }
    expect(
      tester.getTopLeft(amount).dy,
      greaterThan(tester.getTopLeft(name).dy),
    );
    expect(
      tester.getTopLeft(date).dy,
      greaterThan(tester.getTopLeft(amount).dy),
    );
  });

  testWidgets('période des filtres : remplace le mois jusqu\'à effacement', (
    tester,
  ) async {
    await _start(tester);
    // Le mois affiché (octobre) est retrouvé après effacement de la période.
    await _tapAndWait(tester, 'month-previous', 'expense-$_oct31');
    final container = ProviderScope.containerOf(
      tester.element(byKey('expense-month')),
    );
    container
        .read(expenseFilterProvider.notifier)
        .setCriteria(const ExpenseFilter(from: '2026-10-01', to: '2026-12-31'));
    await pumpIo(tester, until: byKey('expense-$_dec1'));
    expect(byKey('expense-$_oct31'), findsOneWidget);
    expect(byKey('expense-$_nov1'), findsOneWidget);
    expect(byKey('month-previous'), findsNothing);
    expect(_textOf('expense-month'), '1 oct. 2026 – 31 déc. 2026');

    await tester.tap(find.byTooltip('Effacer les filtres'));
    await pumpIo(tester, until: byKey('month-previous'));
    expect(_textOf('expense-month'), 'octobre 2026');
    expect(byKey('expense-$_oct31'), findsOneWidget);
    expect(byKey('expense-$_nov1'), findsNothing);
  });

  testWidgets('recherche texte : limitée au mois, sauf période choisie', (
    tester,
  ) async {
    await _start(tester);
    await tester.enterText(byKey('expense-search'), 'marche');
    await pumpIo(tester, until: byKey('expense-search-empty'));
    expect(find.textContaining('en novembre 2026'), findsOneWidget);

    ProviderScope.containerOf(tester.element(byKey('expense-month')))
        .read(expenseFilterProvider.notifier)
        .setCriteria(const ExpenseFilter(from: '2026-01-01', to: '2026-12-31'));
    await pumpIo(tester, until: byKey('expense-$_oct31'));
    expect(byKey('expense-$_nov1'), findsNothing);
  });

  testWidgets('mois sans dépense : message dédié', (tester) async {
    await _start(tester);
    await _tapAndWait(tester, 'month-previous', 'expense-$_oct31');
    await _tapAndWait(tester, 'month-previous', 'expense-search-empty');
    expect(find.text('Aucune dépense ce mois-ci.'), findsOneWidget);
  });
}
