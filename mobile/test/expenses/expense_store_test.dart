// Requêtes et écritures locales de la liste des dépenses (P6-06, ADR-051).
import 'dart:convert';

import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/core/db/expense_filter.dart';
import 'package:depenseo/core/db/expense_store.dart';
import 'package:depenseo/core/money/amount_input.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

const nb = '0190a000-0000-7000-8000-00000000000b';
const otherNb = '0190a000-0000-7000-8000-00000000000c';
const food = '0190a000-0000-7000-8000-0000000000f0';
const groceries = '0190a000-0000-7000-8000-0000000000f1';
const transport = '0190a000-0000-7000-8000-0000000000a0';

String id(int n) =>
    '0190a000-0000-7000-8000-${n.toRadixString(16).padLeft(12, '0')}';

void main() {
  late AppDatabase db;
  final t0 = DateTime.utc(2026, 11, 1, 8);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    for (final (cid, name, parent) in [
      (food, 'Alimentation', null),
      (groceries, 'Courses', food),
      (transport, 'Transport', null),
    ]) {
      await db
          .into(db.categories)
          .insert(
            CategoriesCompanion.insert(
              id: cid,
              notebookId: nb,
              parentId: Value(parent),
              name: name,
              icon: '🛒',
              color: '#000000',
              updatedAt: '2026-11-01T00:00:00.000Z',
            ),
          );
    }
  });
  tearDown(() => db.close());

  Future<void> add(
    int n, {
    int amount = 1000,
    String category = food,
    String date = '2026-11-01',
    String? note,
    String? merchant,
    String notebook = nb,
  }) => db.insertLocalExpense(
    id: id(n),
    notebookId: notebook,
    amount: amount,
    currency: 'EUR',
    categoryId: category,
    date: date,
    now: t0.add(Duration(minutes: n)),
    note: note,
    merchant: merchant,
  );

  Future<List<int>> search(ExpenseFilter filter) async => [
    for (final (e, _) in await db.searchExpenses(nb, filter))
      int.parse(e.id.split('-').last, radix: 16),
  ];

  group('foldForSearch', () {
    test('ignore la casse et les accents (§8.1)', () {
      expect(foldForSearch('Énergie'), 'energie');
      expect(foldForSearch('ŒUVRE Ça'), 'oeuvre ca');
      expect(foldForSearch('Straße'), 'strasse');
      // Forme décomposée (NFD) : marques combinantes retirées.
      expect(foldForSearch('Café'), 'cafe');
    });
  });

  group('searchExpenses', () {
    setUp(() async {
      await add(1, amount: 1250, date: '2026-10-30', merchant: 'Boulangerie');
      await add(2, amount: 4500, category: groceries, note: 'Énergie verte');
      await add(3, amount: 300, category: transport, date: '2026-11-03');
      await add(4, amount: 9999, date: '2026-11-03', merchant: 'Électricité');
      await add(5, notebook: otherNb, merchant: 'Boulangerie');
    });

    test(
      'sans filtre : dépenses actives du carnet, date puis saisie',
      () async {
        await db.markExpenseDeleted(id(1), t0);
        expect(await search(const ExpenseFilter()), [4, 3, 2]);
      },
    );

    test('texte sur note et commerçant, sans casse ni accents', () async {
      expect(await search(const ExpenseFilter(text: 'ENERGIE')), [2]);
      expect(await search(const ExpenseFilter(text: 'electri')), [4]);
      expect(await search(const ExpenseFilter(text: 'boulang')), [1]);
      expect(await search(const ExpenseFilter(text: '  ')), [4, 3, 2, 1]);
    });

    test('montant : bornes incluses', () async {
      expect(
        await search(const ExpenseFilter(minAmount: 1250, maxAmount: 4500)),
        [2, 1],
      );
      expect(await search(const ExpenseFilter(maxAmount: 300)), [3]);
    });

    test('période : bornes incluses, chaînes calendaires', () async {
      expect(
        await search(const ExpenseFilter(from: '2026-11-01', to: '2026-11-02')),
        [2],
      );
      expect(await search(const ExpenseFilter(from: '2026-11-03')), [4, 3]);
    });

    test('catégorie racine : inclut ses sous-catégories', () async {
      expect(await search(const ExpenseFilter(categoryIds: {food})), [4, 2, 1]);
      expect(await search(const ExpenseFilter(categoryIds: {groceries})), [2]);
      expect(
        await search(const ExpenseFilter(categoryIds: {groceries, transport})),
        [3, 2],
      );
    });

    test('filtres combinables', () async {
      expect(
        await search(
          const ExpenseFilter(
            categoryIds: {food},
            from: '2026-11-01',
            minAmount: 5000,
            text: 'élec',
          ),
        ),
        [4],
      );
      expect(
        await search(const ExpenseFilter(categoryIds: {food}, text: 'zzz')),
        isEmpty,
      );
    });

    test('ExpenseFilter : égalité de valeur et état actif', () {
      expect(
        const ExpenseFilter(categoryIds: {food}, text: 'a'),
        ExpenseFilter(categoryIds: {food}, text: 'a'),
      );
      expect(const ExpenseFilter().isEmpty, isTrue);
      expect(const ExpenseFilter(text: ' ').isEmpty, isTrue);
      expect(const ExpenseFilter(to: '2026-11-01').isEmpty, isFalse);
    });
  });

  group('écritures locales (ADR-050)', () {
    setUp(() async {
      await add(1);
      // Ligne reçue du serveur puis refusée : base connue, erreur posée.
      await (db.update(db.expenses)..where((e) => e.id.equals(id(1)))).write(
        const ExpensesCompanion(
          pendingSync: Value(false),
          syncError: Value('rejected'),
          baseUpdatedAt: Value('2026-11-01T08:01:00.000Z'),
        ),
      );
    });

    Future<Expense> row() => db.expenseById(id(1)).then((e) => e!);

    test('modification : en attente, erreur effacée, base conservée', () async {
      await db.updateLocalExpense(
        id(1),
        amount: 2000,
        categoryId: transport,
        date: '2026-11-04',
        note: 'Taxi',
        merchant: null,
        tags: ['pro', 'nuit'],
        now: DateTime.utc(2026, 11, 5, 9, 30, 0, 123, 456),
      );
      final e = await row();
      expect(e.amount, 2000);
      expect(e.categoryId, transport);
      expect(e.date, '2026-11-04');
      expect(e.note, 'Taxi');
      expect(jsonDecode(e.tags), ['pro', 'nuit']);
      expect(e.updatedAt, '2026-11-05T09:30:00.123Z');
      expect(e.createdAt, '2026-11-01T08:01:00.000Z');
      expect(e.pendingSync, isTrue);
      expect(e.syncError, isNull);
      expect(e.baseUpdatedAt, '2026-11-01T08:01:00.000Z');
    });

    test('suppression : deleted_at posé, en attente, base conservée', () async {
      await db.markExpenseDeleted(id(1), DateTime.utc(2026, 11, 5, 9));
      final e = await row();
      expect(e.deletedAt, '2026-11-05T09:00:00.000Z');
      expect(e.updatedAt, '2026-11-05T09:00:00.000Z');
      expect(e.pendingSync, isTrue);
      expect(e.syncError, isNull);
      expect(e.baseUpdatedAt, '2026-11-01T08:01:00.000Z');
    });

    test('restauration acceptée : ligne de nouveau envoyée', () async {
      await (db.update(db.expenses)..where((e) => e.id.equals(id(1)))).write(
        const ExpensesCompanion(
          pendingSync: Value(true),
          syncError: Value('conflict'),
        ),
      );
      await db.markExpenseRestored(
        id(1),
        DateTime.utc(2026, 11, 5, 9),
        '2026-11-05T09:10:00.5+00:00',
      );
      final e = await row();
      expect(e.syncError, isNull);
      expect(e.pendingSync, isTrue);
      expect(e.updatedAt, '2026-11-05T09:00:00.000Z');
      // Repose sur la version restaurée (format des horodatages de la synchro).
      expect(e.baseUpdatedAt, '2026-11-05T09:10:00.500Z');
    });

    test('ligne déjà supprimée localement : modification refusée', () async {
      await db.markExpenseDeleted(id(1), DateTime.utc(2026, 11, 5, 9));
      final found = await db.updateLocalExpense(
        id(1),
        amount: 2000,
        categoryId: food,
        date: '2026-11-04',
        note: null,
        merchant: null,
        tags: const [],
        now: DateTime.utc(2026, 11, 5, 10),
      );
      expect(found, isFalse);
      final e = await row();
      expect((e.amount, e.updatedAt), (1000, '2026-11-05T09:00:00.000Z'));
    });

    test('filtres : catégories masquées proposées, supprimées non', () async {
      await (db.update(db.categories)..where((c) => c.id.equals(transport)))
          .write(const CategoriesCompanion(hidden: Value(true)));
      await (db.update(
        db.categories,
      )..where((c) => c.id.equals(groceries))).write(
        const CategoriesCompanion(deletedAt: Value('2026-11-02T00:00:00.000Z')),
      );
      expect(
        [for (final c in await db.filterableCategories(nb)) c.id],
        // Positions égales dans ce montage : ordre non significatif.
        unorderedEquals([food, transport]),
      );
    });

    test('abandon : la copie locale disparaît', () async {
      await db.discardExpense(id(1));
      expect(await db.expenseById(id(1)), isNull);
    });
  });

  test('amountToInput : inverse de parseAmountInput', () {
    expect(amountToInput(1250, 'EUR', ','), '12,50');
    expect(amountToInput(7, 'EUR', '.'), '0.07');
    expect(amountToInput(1250, 'JPY', ','), '1250');
    expect(amountToInput(12345, 'TND', ','), '12,345');
    for (final cents in [1, 99, 100, 123456789, maxAmount]) {
      final parsed = parseAmountInput(amountToInput(cents, 'EUR', ','), 'EUR');
      expect((parsed as AmountOk).cents, cents);
    }
  });
}
