// Réception différentielle, 410, purge des autres carnets (P6-05, ADR-050).
import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/core/sync/sync_engine.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fake_sync_server.dart';
import 'sync_test_support.dart';

void main() {
  setUpSync();

  test('synchro complète puis différentielle (curseur paginé)', () async {
    server
      ..putExpense(e2, {'amount': 300})
      ..putExpense(e3, {'amount': 400});
    engine = SyncEngine(
      Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
        ..httpClientAdapter = api,
      db,
      pageSize: 1,
    );
    final report = await engine.run(nb);

    expect(report.received, 3);
    expect((await db.select(db.categories).getSingle()).name, 'Alimentation');
    expect(
      (await allLocal()).map((e) => e.amount),
      unorderedEquals([300, 400]),
    );
    final syncCalls = api.calls('GET /notebooks/$nb/sync').toList();
    expect(syncCalls, hasLength(3));
    expect(syncCalls.first.query.containsKey('updated_since'), isFalse);
    expect(syncCalls[1].query['cursor'], isNotNull);

    serverNow = serverNow.add(const Duration(hours: 1));
    server.putExpense(e2, {'amount': 350});
    api.requests.clear();
    final second = await engine.run(nb);
    final call = api.calls('GET /notebooks/$nb/sync').first;
    expect(call.query['updated_since'], '2026-11-05T09:55:00.000Z');
    expect(second.received, greaterThanOrEqualTo(1));
    expect((await local(e2)).amount, 350);
    expect((await local(e2)).pendingSync, isFalse);
  });
  test(
    'aller-retour A → B → A : le compte A retrouve toute sa copie',
    () async {
      server.putExpense(e2, {});
      await engine.run(nb); // A
      final apiB = FakeApi();
      final serverB = FakeSyncServer(apiB, otherNb, now: () => serverNow);
      final engineB = SyncEngine(
        Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
          ..httpClientAdapter = apiB,
        db,
      );
      await engineB.run(otherNb); // B
      expect(serverB.expenses, isEmpty);
      expect(await allLocal(), isEmpty);

      serverNow = serverNow.add(const Duration(hours: 1));
      api.requests.clear();
      await engine.run(nb); // retour de A
      final first = api.calls('GET /notebooks/$nb/sync').first;
      expect(first.query.containsKey('updated_since'), isFalse);
      expect((await allLocal()).map((e) => e.id), [e2]);
      expect(await db.select(db.categories).get(), hasLength(1));
    },
  );
  test('410 : synchro complète puis retrait des seules lignes absentes ; '
      'saisies en attente gardées', () async {
    server.putExpense(e2, {});
    server.putExpense(e3, {});
    await engine.run(nb);
    server.expenses.remove(e2); // purgée côté serveur
    await saveLocal(e1);
    server.failNextCreateWith = 422; // e1 reste en attente
    serverNow = serverNow.add(const Duration(days: 40));
    await engine.run(nb);

    final fullWalks = api
        .calls('GET /notebooks/$nb/sync')
        .where(
          (r) =>
              !r.query.containsKey('updated_since') &&
              !r.query.containsKey('cursor'),
        );
    expect(fullWalks, hasLength(2));
    expect((await allLocal()).map((e) => e.id), unorderedEquals([e1, e3]));
    expect((await local(e1)).pendingSync, isTrue);
    expect(await db.select(db.categories).get(), hasLength(1));
  });
  test(
    '410 puis coupure pendant la synchro complète : rien n’est effacé',
    () async {
      server.putExpense(e2, {});
      engine = SyncEngine(
        Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
          ..httpClientAdapter = api,
        db,
        pageSize: 1,
      );
      await engine.run(nb);
      serverNow = serverNow.add(const Duration(days: 40));
      final sync = api.routes['GET /notebooks/$nb/sync']!;
      var calls = 0;
      api.on('GET /notebooks/$nb/sync', (r) {
        calls++;
        if (calls == 2) server.offline = true; // 1re page après le 410
        return sync(r);
      });
      final before = await db.readMeta(sinceKey(nb));
      await expectLater(engine.run(nb), throwsA(isA<SyncUnavailable>()));
      expect(await db.readMeta(sinceKey(nb)), before);
      expect((await allLocal()).map((e) => e.id), [e2]);
      expect(await db.select(db.categories).get(), hasLength(1));
    },
  );
  test(
    'données d’un autre carnet : synchronisées purgées, en attente gardées',
    () async {
      await db
          .into(db.expenses)
          .insert(
            ExpensesCompanion.insert(
              id: e2,
              notebookId: otherNb,
              amount: 1,
              currency: 'EUR',
              categoryId: food,
              date: '2026-11-01',
              createdAt: '2026-11-01T00:00:00.000Z',
              updatedAt: '2026-11-01T00:00:00.000Z',
              pendingSync: const Value(false),
            ),
          );
      await saveLocal(e3, notebookId: otherNb);
      await db.writeMeta('dashboard.v1.$otherNb', '{}');
      await db.writeMeta('dashboard.v1.$nb', '{}');
      await engine.run(nb);
      final ids = (await allLocal()).map((e) => e.id);
      expect(ids, [e3]);
      // Tableau de bord gardé (ADR-055) : seul celui du carnet courant reste.
      expect(await db.readMeta('dashboard.v1.$otherNb'), isNull);
      expect(await db.readMeta('dashboard.v1.$nb'), '{}');
      expect(api.requests.where((r) => r.path.contains(otherNb)), isEmpty);
    },
  );
}
