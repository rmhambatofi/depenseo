// Outils communs aux tests de la saisie rapide (P6-04).
import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/providers.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/test_app.dart';

const notebookId = '0190a000-0000-7000-8000-00000000000b';
const food = '0190a000-0000-7000-8000-0000000000f0';
const groceries = '0190a000-0000-7000-8000-0000000000f1';
const transport = '0190a000-0000-7000-8000-0000000000a0';
const hiddenRoot = '0190a000-0000-7000-8000-0000000000c0';

CategoriesCompanion category(
  String id,
  String name, {
  String? parentId,
  int position = 0,
  bool hidden = false,
  String? deletedAt,
}) => CategoriesCompanion.insert(
  id: id,
  notebookId: notebookId,
  parentId: Value(parentId),
  name: name,
  icon: '🛒',
  color: '#43A047',
  position: Value(position),
  hidden: Value(hidden),
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: Value(deletedAt),
);

/// Laisse aboutir les E/S réelles de la base (hors horloge simulée) jusqu'à
/// ce que [until] apparaisse (par défaut : plus d'indicateur d'attente).
Future<void> pumpIo(WidgetTester tester, {Finder? until}) async {
  bool ready() => until != null
      ? until.evaluate().isNotEmpty
      : find.byType(CircularProgressIndicator).evaluate().isEmpty;
  for (var i = 0; i < 500; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
    if (i >= 3 && ready()) break;
  }
  await tester.pumpAndSettle();
  expect(
    until ?? find.byType(CircularProgressIndicator),
    until == null ? findsNothing : findsWidgets,
  );
}

/// Enregistre puis attend le retour à l'accueil.
Future<void> save(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('save-expense')));
  await pumpIo(tester, until: find.byKey(const Key('add-expense')));
}

/// Attend [action] lancée dans la zone du test : la base répond par de vraies
/// E/S, que l'on laisse aboutir entre deux trames simulées.
Future<T> io<T>(WidgetTester tester, Future<T> Function() action) async {
  T? result;
  Object? error;
  var done = false;
  action().then(
    (v) {
      result = v;
      done = true;
    },
    onError: (Object e) {
      error = e;
      done = true;
    },
  );
  // Budget en temps réel, pas en tours : la CI (couverture) est bien plus
  // lente que la machine locale (2,5 s ne suffisaient pas).
  final clock = Stopwatch()..start();
  while (!done && clock.elapsed < const Duration(seconds: 20)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 5)),
    );
    await tester.pump();
  }
  if (error != null) throw error!;
  if (!done) fail('E/S de la base sans réponse');
  return result as T;
}

Future<AppDatabase> database(TestApp app, WidgetTester tester) =>
    io(tester, () => app.container.read(databaseProvider.future));

Future<List<Expense>> expenses(TestApp app, WidgetTester tester) async {
  final db = await database(app, tester);
  return io(tester, () => db.select(db.expenses).get());
}

/// Compte connecté, en ligne, avec un plan de catégories local.
Future<TestApp> startSignedIn(
  WidgetTester tester, {
  Locale locale = const Locale('fr'),
  String timeZone = 'Europe/Paris',
  String currency = 'EUR',
  void Function(TestApp app)? configure,
}) async {
  final app = TestApp();
  configure?.call(app);
  app.api
    ..on(
      'GET /me',
      (_) => FakeResponse(200, {
        'id': '0190a000-0000-7000-8000-0000000000aa',
        'email': 'a@example.org',
        'language': 'fr',
        'timeZone': timeZone,
        'currency': currency,
      }),
    )
    ..on(
      'GET /notebooks',
      (_) => const FakeResponse(200, [
        {
          'id': notebookId,
          'name': 'Perso',
          'kind': 'personal',
          'role': 'owner',
        },
      ]),
    );
  await app.signIn();
  await app.pump(tester, locale: locale);
  final db = await database(app, tester);
  await io(
    tester,
    () => db.batch(
      (b) => b.insertAll(db.categories, [
        category(food, 'Alimentation', position: 1),
        category(groceries, 'Courses', parentId: food, position: 1),
        category(transport, 'Transport', position: 2),
        category(hiddenRoot, 'Masquée', position: 3, hidden: true),
        category(
          '0190a000-0000-7000-8000-0000000000c1',
          'Fille de masquée',
          parentId: hiddenRoot,
        ),
        category(
          '0190a000-0000-7000-8000-0000000000d0',
          'Supprimée',
          position: 4,
          deletedAt: '2026-11-02T00:00:00.000Z',
        ),
      ]),
    ),
  );
  await pumpIo(tester);
  return app;
}

Future<void> openQuickEntryUntil(WidgetTester tester, Finder until) async {
  await tester.tap(find.byKey(const Key('add-expense')));
  await pumpIo(tester, until: until);
}

Future<void> openQuickEntry(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('add-expense')));
  await pumpIo(tester, until: find.byKey(const Key('expense-amount')));
}
