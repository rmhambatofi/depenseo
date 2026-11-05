// File d'envoi et conflits (P6-05, NF-OFF-01, ADR-050).
import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/core/sync/sync_engine.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import 'sync_test_support.dart';

void main() {
  setUpSync();

  test('une saisie locale est envoyée puis marquée synchronisée', () async {
    await saveLocal(e1);
    final report = await engine.run(nb);

    expect(report.sent, 1);
    final remote = server.expenses[e1]!;
    expect((remote['amount'], remote['merchant']), (1250, 'Marché'));
    expect(remote['tags'], ['bio']);
    final row = await local(e1);
    expect(row.pendingSync, isFalse);
    expect(row.updatedAt, '2026-11-05T10:00:00.000Z');
  });
  test(
    'envoi interrompu (réponse perdue) puis rejoué → pas de doublon',
    () async {
      await saveLocal(e1);
      server.loseNextResponse = true;

      await expectLater(engine.run(nb), throwsA(isA<SyncUnavailable>()));
      expect(server.expenses, hasLength(1));
      expect((await local(e1)).pendingSync, isTrue);

      await engine.run(nb);
      expect(server.expenses, hasLength(1));
      expect(posts(), 2);
      expect(api.calls('PATCH /notebooks/$nb/expenses/$e1'), isEmpty);
      expect((await local(e1)).pendingSync, isFalse);
      expect(await allLocal(), hasLength(1));
    },
  );
  test('hors ligne : rien ne change, l’erreur est signalée', () async {
    await saveLocal(e1);
    server.offline = true;
    await expectLater(engine.run(nb), throwsA(isA<SyncUnavailable>()));
    expect((await local(e1)).pendingSync, isTrue);
    expect(await db.select(db.categories).get(), isEmpty);
  });
  test(
    'erreur serveur 5xx : nouvel essai plus tard, rien n’est perdu',
    () async {
      await saveLocal(e1);
      server.failNextCreateWith = 503;
      await expectLater(engine.run(nb), throwsA(isA<SyncUnavailable>()));
      expect((await local(e1)).pendingSync, isTrue);
      await engine.run(nb);
      expect((await local(e1)).pendingSync, isFalse);
    },
  );
  test('dernière écriture gagne : modification locale plus récente gardée '
      'et envoyée par PATCH', () async {
    server.putExpense(e1, {'amount': 100}); // 10:00 serveur
    await engine.run(nb);
    // Modification locale à 11:00, après celle du serveur.
    await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
      const ExpensesCompanion(
        amount: Value(999),
        updatedAt: Value('2026-11-05T11:00:00.000Z'),
        pendingSync: Value(true),
      ),
    );
    server.route(e1);
    serverNow = DateTime.utc(2026, 11, 5, 12);
    await engine.run(nb);

    expect(server.expenses[e1]!['amount'], 999);
    expect(api.calls('PATCH /notebooks/$nb/expenses/$e1'), hasLength(1));
    final row = await local(e1);
    expect((row.amount, row.pendingSync), (999, false));
  });
  test('dernière écriture gagne : version serveur plus récente qu’une '
      'modification locale plus ancienne', () async {
    server.putExpense(e1, {'amount': 100});
    await engine.run(nb);
    await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
      const ExpensesCompanion(
        amount: Value(999),
        updatedAt: Value('2026-11-05T10:30:00.000Z'),
        pendingSync: Value(true),
      ),
    );
    serverNow = DateTime.utc(2026, 11, 5, 11);
    server.putExpense(e1, {'amount': 555}); // autre appareil, 11:00
    server.route(e1);
    await engine.run(nb);

    expect(server.expenses[e1]!['amount'], 555);
    expect(api.calls('PATCH /notebooks/$nb/expenses/$e1'), isEmpty);
    final row = await local(e1);
    expect((row.amount, row.pendingSync), (555, false));
  });
  test('ligne déjà sur le serveur (autre version), saisie locale jamais '
      'reçue : la saisie locale part par PATCH', () async {
    server.putExpense(e1, {'amount': 100}); // 10:00, autre appareil
    await saveLocal(e1, amount: 777, at: DateTime.utc(2026, 11, 5, 10, 30));
    server.route(e1);
    // Premier envoi : le serveur a déjà la ligne (plus ancienne) → PATCH.
    serverNow = DateTime.utc(2026, 11, 5, 11);
    await engine.run(nb);
    expect(server.expenses[e1]!['amount'], 777);
    expect((await local(e1)).amount, 777);
  });
  test(
    'une modification locale faite pendant l’envoi reste en attente',
    () async {
      await saveLocal(e1);
      final create = api.routes['POST /notebooks/$nb/expenses']!;
      api.on('POST /notebooks/$nb/expenses', (r) async {
        final response = await create(r);
        await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
          const ExpensesCompanion(
            amount: Value(4242),
            updatedAt: Value('2026-11-05T10:00:00.001Z'),
          ),
        );
        return response;
      });
      await engine.run(nb);
      final row = await local(e1);
      expect((row.amount, row.pendingSync), (4242, true));
    },
  );
  test('refus 422 (catégorie supprimée) : gardée localement, marquée, '
      'non renvoyée ; les autres partent', () async {
    await saveLocal(e1);
    await saveLocal(e2, at: DateTime.utc(2026, 11, 5, 9, 1));
    server.failNextCreateWith = 422;
    final report = await engine.run(nb);
    expect((report.sent, report.rejected), (1, 1));
    final rejected = await local(e1);
    expect((rejected.pendingSync, rejected.syncError), (true, 'rejected'));
    expect((await local(e2)).pendingSync, isFalse);

    api.requests.clear();
    await engine.run(nb);
    expect(posts(), 0);
  });
  test('suppression locale envoyée par DELETE', () async {
    server.putExpense(e1, {});
    server.route(e1);
    await engine.run(nb);
    await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
      const ExpensesCompanion(
        deletedAt: Value('2026-11-05T10:10:00.000Z'),
        updatedAt: Value('2026-11-05T10:10:00.000Z'),
        pendingSync: Value(true),
      ),
    );
    serverNow = DateTime.utc(2026, 11, 5, 10, 20);
    await engine.run(nb);
    expect(server.expenses[e1]!['deletedAt'], isNotNull);
    final row = await local(e1);
    expect(row.pendingSync, isFalse);
    expect(row.deletedAt, isNotNull);
  });
  test('dépense supprimée ailleurs (409) : la suppression, plus récente, '
      's’applique localement', () async {
    server.putExpense(e1, {'deletedAt': '2026-11-05T09:30:00.000Z'});
    await saveLocal(e1);
    await engine.run(nb);
    final row = await local(e1);
    expect(row.pendingSync, isFalse);
    expect(row.deletedAt, isNotNull);
  });
  test('409 sans suppression reçue (identifiant pris) : saisie gardée, '
      'marquée en conflit, non renvoyée', () async {
    await saveLocal(e1);
    server.failNextCreateWith = 409;
    await engine.run(nb);
    final row = await local(e1);
    expect(
      (row.pendingSync, row.syncError, row.deletedAt),
      (true, 'conflict', null),
    );
    api.requests.clear();
    await engine.run(nb);
    expect(posts(), 0);
  });
  test('horloge du serveur en avance : une modification locale faite après '
      'la dernière réception part quand même (base inchangée)', () async {
    serverNow = DateTime.utc(2026, 11, 5, 10, 0, 5);
    server.putExpense(e1, {'amount': 100});
    server.route(e1);
    await engine.run(nb);
    expect((await local(e1)).baseUpdatedAt, '2026-11-05T10:00:05.000Z');
    // Appareil en retard de 4 s sur le serveur.
    await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
      const ExpensesCompanion(
        amount: Value(999),
        updatedAt: Value('2026-11-05T10:00:01.000Z'),
        pendingSync: Value(true),
      ),
    );
    serverNow = DateTime.utc(2026, 11, 5, 10, 0, 6);
    await engine.run(nb);
    expect(server.expenses[e1]!['amount'], 999);
    expect((await local(e1)).pendingSync, isFalse);
  });
  test(
    'changement de compte pendant le passage : rien n’est acquitté',
    () async {
      var current = true;
      engine = SyncEngine(
        Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
          ..httpClientAdapter = api,
        db,
        stillCurrent: () async => current,
      );
      await saveLocal(e1);
      final create = api.routes['POST /notebooks/$nb/expenses']!;
      api.on('POST /notebooks/$nb/expenses', (r) {
        current = false; // déconnexion / autre compte pendant l'envoi
        return create(r);
      });
      await expectLater(engine.run(nb), throwsA(isA<SyncUnavailable>()));
      expect((await local(e1)).pendingSync, isTrue);
      expect(await db.readMeta(sinceKey(nb)), isNull);
    },
  );
  test('401 propagé tel quel (session expirée)', () async {
    api.on('GET /notebooks/$nb/sync', (_) => FakeResponse.problem(401, 'x'));
    await expectLater(
      engine.run(nb),
      throwsA(
        isA<DioException>().having(
          (e) => e.response?.statusCode,
          'status',
          401,
        ),
      ),
    );
  });

  test('modification pendant un PATCH, horloge du serveur en avance : la '
      'modification n’est pas perdue au passage suivant', () async {
    server.putExpense(e1, {'amount': 100});
    server.route(e1);
    await engine.run(nb); // base = 10:00 serveur
    await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
      const ExpensesCompanion(
        amount: Value(200),
        updatedAt: Value('2026-11-05T10:01:00.000Z'),
        pendingSync: Value(true),
      ),
    );
    // Serveur en avance de 10 min sur l'appareil.
    serverNow = DateTime.utc(2026, 11, 5, 10, 11);
    final patch = api.routes['PATCH /notebooks/$nb/expenses/$e1']!;
    var first = true;
    api.on('PATCH /notebooks/$nb/expenses/$e1', (r) async {
      final response = await patch(r);
      if (first) {
        first = false;
        await (db.update(db.expenses)..where((e) => e.id.equals(e1))).write(
          const ExpensesCompanion(
            amount: Value(300),
            updatedAt: Value('2026-11-05T10:02:00.000Z'),
          ),
        );
      }
      return response;
    });
    await engine.run(nb);
    expect((await local(e1)).pendingSync, isTrue);
    serverNow = DateTime.utc(2026, 11, 5, 10, 12);
    await engine.run(nb);
    expect(server.expenses[e1]!['amount'], 300);
    final row = await local(e1);
    expect((row.amount, row.pendingSync), (300, false));
  });
}
