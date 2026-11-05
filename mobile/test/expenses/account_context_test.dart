import 'dart:async';
import 'dart:io';

import 'package:depenseo/core/account/account_context.dart';
import 'package:depenseo/core/db/app_database.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';

Map<String, Object> me({String currency = 'EUR'}) => {
  'id': 'user-b',
  'email': 'b@example.org',
  'language': 'fr',
  'timeZone': 'Indian/Reunion',
  'currency': currency,
};

const notebooks = [
  {'id': 'shared-1', 'name': 'Couple', 'kind': 'shared', 'role': 'member'},
  {'id': 'perso-b', 'name': 'Perso', 'kind': 'personal', 'role': 'owner'},
];

void main() {
  late FakeApi api;
  late AppDatabase db;
  late AccountContextRepository repo;
  String? current;

  setUp(() {
    api = FakeApi()
      ..on('GET /me', (_) => FakeResponse(200, me()))
      ..on('GET /notebooks', (_) => const FakeResponse(200, notebooks));
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = api;
    db = AppDatabase(NativeDatabase.memory());
    current = 'e1';
    repo = AccountContextRepository(dio, db, currentEpoch: () async => current);
  });
  tearDown(() => db.close());

  void offline() => api
    ..on('GET /me', (_) => throw const SocketException('offline'))
    ..on('GET /notebooks', (_) => throw const SocketException('offline'));

  test('sans copie : lu en ligne (carnet personnel) et gardé', () async {
    final c = await repo.load('e1');
    expect(
      (c.userId, c.notebookId, c.currency, c.timeZone),
      ('user-b', 'perso-b', 'EUR', 'Indian/Reunion'),
    );
    offline();
    final again = await repo.load('e1');
    expect(again.notebookId, 'perso-b');
  });

  test('copie présente : servie sans attendre, rafraîchie en fond', () async {
    await repo.load('e1');
    api.on('GET /me', (_) => FakeResponse(200, me(currency: 'CHF')));
    late Future<void> refresh;
    final cached = await repo.load('e1', refreshed: (r) => refresh = r);
    expect(cached.currency, 'EUR');
    await refresh;
    expect((await repo.load('e1')).currency, 'CHF');
  });

  test('rafraîchissement en échec : la copie reste', () async {
    await repo.load('e1');
    offline();
    late Future<void> refresh;
    expect(
      (await repo.load('e1', refreshed: (r) => refresh = r)).currency,
      'EUR',
    );
    await refresh;
    expect((await repo.load('e1')).currency, 'EUR');
  });

  test('ni copie ni réseau : indisponible', () async {
    offline();
    await expectLater(
      repo.load('e1'),
      throwsA(isA<AccountContextUnavailable>()),
    );
  });

  test('401 sans copie : l\'erreur de session remonte', () async {
    api.on('GET /me', (_) => FakeResponse.problem(401, 'Unauthorized'));
    await expectLater(
      repo.load('e1'),
      throwsA(
        isA<DioException>().having(
          (e) => e.response?.statusCode,
          'status',
          401,
        ),
      ),
    );
  });

  test('devise hors table ISO figée : indisponible, rien de gardé', () async {
    api.on('GET /me', (_) => FakeResponse(200, me(currency: 'XXX')));
    await expectLater(
      repo.load('e1'),
      throwsA(isA<AccountContextUnavailable>()),
    );
    expect(await db.readMeta('account.notebook_id'), isNull);
  });

  test('copie d\'une autre session de compte jamais resservie', () async {
    await repo.load('e1');
    offline();
    current = 'e2';
    await expectLater(
      repo.load('e2'),
      throwsA(isA<AccountContextUnavailable>()),
    );
    current = 'e1';
    expect((await repo.load('e1')).notebookId, 'perso-b');
  });

  test('réponse tardive d\'une session précédente : la copie courante est '
      'gardée', () async {
    // Le compte A (e1) a lancé un rafraîchissement ; B (e2) se connecte.
    final gate = Completer<void>();
    var calls = 0;
    api.on('GET /me', (_) async {
      if (++calls == 1) {
        await gate.future;
        return FakeResponse(200, me(currency: 'CHF'));
      }
      return FakeResponse(200, me(currency: 'GBP'));
    });
    final lateRefresh = repo.refreshInBackground('e1');
    current = 'e2';
    expect((await repo.load('e2')).currency, 'GBP');
    gate.complete();
    await lateRefresh;
    offline();
    expect((await repo.load('e2')).currency, 'GBP');
    expect(await db.readMeta('account.epoch'), 'e2');
  });

  test('réponse de forme inattendue : indisponible', () async {
    api.on('GET /me', (_) => const FakeResponse(200, {'id': 'user-b'}));
    await expectLater(
      repo.load('e1'),
      throwsA(isA<AccountContextUnavailable>()),
    );
  });
}
