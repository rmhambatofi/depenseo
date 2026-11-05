// Montage commun des tests du moteur de synchro (P6-05, ADR-050).
import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/core/sync/sync_engine.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fake_sync_server.dart';

const nb = '0190a000-0000-7000-8000-00000000000b';
const otherNb = '0190a000-0000-7000-8000-00000000000c';
const food = '0190a000-0000-7000-8000-0000000000f0';
const e1 = '0190a000-0000-7000-8000-000000000e01';
const e2 = '0190a000-0000-7000-8000-000000000e02';
const e3 = '0190a000-0000-7000-8000-000000000e03';

late FakeApi api;
late FakeSyncServer server;
late AppDatabase db;
late SyncEngine engine;
late DateTime serverNow;

/// Base en mémoire, faux serveur et moteur neufs pour chaque test.
void setUpSync() {
  setUp(() {
    serverNow = DateTime.utc(2026, 11, 5, 10);
    api = FakeApi();
    server = FakeSyncServer(api, nb, now: () => serverNow)
      ..addCategory(food, 'Alimentation');
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = api;
    db = AppDatabase(NativeDatabase.memory());
    engine = SyncEngine(dio, db);
  });
  tearDown(() => db.close());
}

Future<void> saveLocal(
  String id, {
  String notebookId = nb,
  int amount = 1250,
  DateTime? at,
  List<String> tags = const ['bio'],
}) => db.insertLocalExpense(
  id: id,
  notebookId: notebookId,
  amount: amount,
  currency: 'EUR',
  categoryId: food,
  date: '2026-11-05',
  now: at ?? DateTime.utc(2026, 11, 5, 9),
  merchant: 'Marché',
  tags: tags,
);

Future<Expense> local(String id) =>
    (db.select(db.expenses)..where((e) => e.id.equals(id))).getSingle();

Future<List<Expense>> allLocal() => db.select(db.expenses).get();

int posts() => api.calls('POST /notebooks/$nb/expenses').length;
