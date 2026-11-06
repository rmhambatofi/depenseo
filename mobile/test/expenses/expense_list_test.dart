// Liste, recherche, modification et suppression annulable (P6-06, ADR-051).
import 'dart:convert';

import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/features/auth/auth_controller.dart';
import 'package:depenseo/features/auth/login_screen.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/test_app.dart';
import 'quick_entry_harness.dart';

const e1 = '0190a000-0000-7000-8000-000000000e01';
const e2 = '0190a000-0000-7000-8000-000000000e02';
const e3 = '0190a000-0000-7000-8000-000000000e03';

Finder byKey(String key) => find.byKey(Key(key));

/// Trois dépenses déjà synchronisées (base serveur connue).
Future<AppDatabase> seed(TestApp app, WidgetTester tester) async {
  final db = await database(app, tester);
  final now = DateTime.utc(2026, 11, 4, 8);
  for (final (id, amount, category, date, merchant, note) in [
    (e1, 1250, food, '2026-11-01', 'Boulangerie', null),
    (e2, 4500, groceries, '2026-11-02', null, 'Énergie verte'),
    (e3, 300, transport, '2026-11-03', 'Métro', null),
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
  await io(
    tester,
    () => db
        .update(db.expenses)
        .write(
          const ExpensesCompanion(
            pendingSync: Value(false),
            baseUpdatedAt: Value('2026-11-04T08:00:00.000Z'),
          ),
        ),
  );
  return db;
}

Future<Expense> row(AppDatabase db, WidgetTester tester, String id) => io(
  tester,
  () => (db.select(db.expenses)..where((e) => e.id.equals(id))).getSingle(),
);

/// Accueil rafraîchi après l'amorçage de la base.
Future<AppDatabase> startWithExpenses(WidgetTester tester) async {
  final app = await startSignedIn(tester);
  final db = await seed(app, tester);
  await openList(tester);
  return db;
}

Future<void> openFilters(WidgetTester tester) async {
  await tester.tap(byKey('open-filters'));
  await pumpIo(tester, until: byKey('filter-category-$food'));
}

Future<void> openList(WidgetTester tester) async {
  await tester.tap(byKey('open-expenses'));
  await pumpIo(tester, until: byKey('expense-$e1'));
}

/// Requête Dio puis écriture en base : le minuteur zéro de Dio n'avance
/// qu'avec une durée simulée, la base qu'avec de vraies E/S.
Future<void> settleRequest(WidgetTester tester, Finder until) async {
  for (var i = 0; i < 100 && until.evaluate().isEmpty; i++) {
    await tester.pump(const Duration(milliseconds: 10));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
  }
  await tester.pump();
  expect(until, findsWidgets);
}

Future<void> openExpenseTile(WidgetTester tester, String id) async {
  // Liste groupée par jour (P8-05) : la dernière tuile peut sortir de l'écran.
  await tester.ensureVisible(byKey('expense-$id'));
  await tester.pump();
  await tester.tap(byKey('expense-$id'));
  await pumpIo(tester, until: byKey('delete-expense'));
}

void main() {
  testWidgets('recherche sans accents et filtres combinables', (tester) async {
    await startWithExpenses(tester);
    expect(byKey('expense-$e2'), findsOneWidget);
    expect(byKey('expense-$e3'), findsOneWidget);

    await tester.enterText(byKey('expense-search'), 'ENERGIE');
    await pumpIo(tester, until: find.text('Courses'));
    expect(byKey('expense-$e2'), findsOneWidget);
    expect(byKey('expense-$e1'), findsNothing);
    expect(byKey('expense-$e3'), findsNothing);

    // Catégorie racine (inclut « Courses ») et montant minimum, en plus du texte.
    await tester.enterText(byKey('expense-search'), '');
    await pumpIo(tester, until: byKey('expense-$e3'));
    await openFilters(tester);
    await tester.tap(byKey('filter-category-$food'));
    await tester.enterText(byKey('filter-min-amount'), '13');
    await tester.tap(byKey('apply-filters'));
    await pumpIo(tester, until: byKey('clear-filters'));
    expect(byKey('expense-$e2'), findsOneWidget);
    expect(byKey('expense-$e1'), findsNothing);
    expect(byKey('expense-$e3'), findsNothing);

    await tester.enterText(byKey('expense-search'), 'boulang');
    await pumpIo(tester, until: byKey('expense-search-empty'));

    // Effacer les critères garde le texte.
    await tester.tap(find.byTooltip('Effacer les filtres'));
    await pumpIo(tester, until: byKey('expense-$e1'));
    expect(byKey('expense-$e2'), findsNothing);
  });

  testWidgets('bornes de montant incohérentes : refusées', (tester) async {
    await startWithExpenses(tester);
    await openFilters(tester);
    await tester.enterText(byKey('filter-min-amount'), '20');
    await tester.enterText(byKey('filter-max-amount'), '10');
    await tester.tap(byKey('apply-filters'));
    await tester.pumpAndSettle();
    expect(
      find.text('Le maximum doit être supérieur ou égal au minimum.'),
      findsOneWidget,
    );
    expect(byKey('apply-filters'), findsOneWidget);
  });

  testWidgets('modification : en attente, base conservée (ADR-050)', (
    tester,
  ) async {
    final db = await startWithExpenses(tester);
    await io(
      tester,
      () => (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
        const ExpensesCompanion(syncError: Value('rejected')),
      ),
    );
    await openExpenseTile(tester, e1);
    expect(find.text('Modifier la dépense'), findsOneWidget);
    expect(find.widgetWithText(TextField, '12,50'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Boulangerie'), findsOneWidget);

    await tester.enterText(byKey('expense-amount'), '13,75');
    await tester.enterText(byKey('expense-tags'), 'pain, matin');
    await tester.tap(byKey('category-$transport'));
    await tester.tap(byKey('save-expense'));
    await pumpIo(tester, until: find.text('Dépense enregistrée.'));

    final e = await row(db, tester, e1);
    expect(e.amount, 1375);
    expect(e.categoryId, transport);
    expect(jsonDecode(e.tags), ['pain', 'matin']);
    expect(e.date, '2026-11-01');
    expect(e.pendingSync, isTrue);
    expect(e.syncError, isNull);
    expect(e.baseUpdatedAt, '2026-11-04T08:00:00.000Z');
    expect(e.updatedAt, isNot('2026-11-04T08:00:00.000Z'));
  });

  testWidgets('suppression annulée à 4 s : la dépense est restaurée', (
    tester,
  ) async {
    final db = await startWithExpenses(tester);
    await openExpenseTile(tester, e1);
    await tester.tap(byKey('delete-expense'));
    await tester.pumpAndSettle();
    expect(byKey('expense-$e1'), findsNothing);
    expect(find.text('Dépense supprimée.'), findsOneWidget);

    await tester.pump(const Duration(seconds: 4));
    await tester.tap(byKey('undo-delete'));
    await tester.pump();
    expect(byKey('expense-$e1'), findsOneWidget);

    // Au-delà du délai initial, rien n'est écrit.
    await tester.pump(const Duration(seconds: 3));
    await pumpIo(tester);
    final e = await row(db, tester, e1);
    expect(e.deletedAt, isNull);
    expect(e.pendingSync, isFalse);
    expect(byKey('expense-$e1'), findsOneWidget);
  });

  testWidgets('suppression non annulée : écrite après 5 s, plus annulable '
      'à 6 s', (tester) async {
    final db = await startWithExpenses(tester);
    await openExpenseTile(tester, e1);
    await tester.tap(byKey('delete-expense'));
    await tester.pumpAndSettle();

    await tester.pump(const Duration(seconds: 4));
    expect((await row(db, tester, e1)).deletedAt, isNull);

    await tester.pump(const Duration(seconds: 2));
    await pumpIo(tester);
    expect(byKey('undo-delete'), findsNothing);
    expect(byKey('expense-$e1'), findsNothing);
    final e = await row(db, tester, e1);
    expect(e.deletedAt, isNotNull);
    expect(e.pendingSync, isTrue);
    expect(e.baseUpdatedAt, '2026-11-04T08:00:00.000Z');

    // Sur l'onglet Accueil, la dépense n'y figure pas non plus.
    await tester.tap(byKey('open-home'));
    await pumpIo(tester, until: byKey('recent-expenses'));
    expect(byKey('expense-$e1'), findsNothing);
    expect(byKey('expense-$e2'), findsOneWidget);
  });

  testWidgets('déconnexion pendant le délai : suppression abandonnée', (
    tester,
  ) async {
    final app = await startSignedIn(tester);
    final db = await seed(app, tester);
    app.api.on('POST /auth/logout', (_) => const FakeResponse(204));
    await openList(tester);
    await openExpenseTile(tester, e1);
    await tester.tap(byKey('delete-expense'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 2));

    // Pas d'`io` : la requête Dio n'avance qu'avec une durée simulée.
    app.container.read(authControllerProvider.notifier).logout().ignore();
    await settleRequest(tester, find.byType(LoginScreen));
    await tester.pump(const Duration(seconds: 6));
    await pumpIo(tester);
    final e = await row(db, tester, e1);
    expect(e.deletedAt, isNull);
    expect(e.pendingSync, isFalse);
  });

  group('dépense en conflit (supprimée ailleurs)', () {
    Future<(TestApp, AppDatabase)> startConflict(WidgetTester tester) async {
      final app = await startSignedIn(tester);
      final db = await seed(app, tester);
      await io(
        tester,
        () => (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
          const ExpensesCompanion(
            pendingSync: Value(true),
            syncError: Value('conflict'),
          ),
        ),
      );
      await openList(tester);
      await openExpenseTile(tester, e1);
      expect(byKey('expense-conflict'), findsOneWidget);
      return (app, db);
    }

    testWidgets('restaurer : POST …/restore puis renvoi de la ligne', (
      tester,
    ) async {
      final (app, db) = await startConflict(tester);
      app.api.on(
        'POST /notebooks/$notebookId/expenses/$e1/restore',
        (_) => const FakeResponse(200, {
          'id': e1,
          'updatedAt': '2026-11-05T12:00:00.000Z',
        }),
      );
      await tester.tap(byKey('restore-expense'));
      await settleRequest(tester, find.text('Dépense restaurée.'));
      expect(
        app.api.calls('POST /notebooks/$notebookId/expenses/$e1/restore'),
        hasLength(1),
      );
      final e = await row(db, tester, e1);
      expect(e.syncError, isNull);
      expect(e.pendingSync, isTrue);
      expect(e.deletedAt, isNull);
      expect(e.baseUpdatedAt, '2026-11-05T12:00:00.000Z');
    });

    testWidgets('restauration impossible hors ligne : conflit conservé', (
      tester,
    ) async {
      final (app, db) = await startConflict(tester);
      app.api.on(
        'POST /notebooks/$notebookId/expenses/$e1/restore',
        (_) => FakeResponse.problem(503, 'Unavailable'),
      );
      await tester.tap(byKey('restore-expense'));
      await settleRequest(
        tester,
        find.textContaining('Restauration impossible'),
      );
      expect(byKey('expense-conflict'), findsOneWidget);
      expect((await row(db, tester, e1)).syncError, 'conflict');
    });

    testWidgets('abandonner : la copie locale disparaît après confirmation', (
      tester,
    ) async {
      final (_, db) = await startConflict(tester);
      await tester.tap(byKey('discard-expense'));
      await tester.pumpAndSettle();
      await tester.tap(byKey('confirm-discard'));
      await pumpIo(tester, until: find.text('Dépense abandonnée.'));
      expect(byKey('expense-$e1'), findsNothing);
      final rows = await io(
        tester,
        () => (db.select(db.expenses)..where((e) => e.id.equals(e1))).get(),
      );
      expect(rows, isEmpty);
    });
  });
}
