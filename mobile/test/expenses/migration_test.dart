import 'dart:io';

import 'package:depenseo/core/db/app_database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

void main() {
  test('migration 1 → 2 : métadonnées gardées, tables dépenses et '
      'catégories créées', () async {
    final dir = Directory.systemTemp.createTempSync('depenseo-mig-');
    addTearDown(() => dir.deleteSync(recursive: true));
    final file = File('${dir.path}/v1.sqlite');
    sqlite3.open(file.path)
      ..execute(
        'CREATE TABLE app_meta (key TEXT NOT NULL, value TEXT NOT NULL, '
        'PRIMARY KEY (key))',
      )
      ..execute("INSERT INTO app_meta VALUES ('k', 'v')")
      ..execute('PRAGMA user_version = 1')
      ..close();

    final db = AppDatabase(NativeDatabase(file));
    addTearDown(db.close);
    expect(await db.readMeta('k'), 'v');
    await db.insertLocalExpense(
      id: '0190a000-0000-7000-8000-000000000001',
      notebookId: 'n',
      amount: 1250,
      currency: 'EUR',
      categoryId: 'c',
      date: '2026-11-05',
      now: DateTime.utc(2026, 11, 5, 9),
      tags: const ['bio'],
    );
    final row = await db.select(db.expenses).getSingle();
    expect((row.amount, row.tags, row.pendingSync), (1250, '["bio"]', true));
    expect(await db.select(db.categories).get(), isEmpty);
    final indexes = await db
        .customSelect("SELECT name FROM sqlite_master WHERE type = 'index'")
        .map((r) => r.read<String>('name'))
        .get();
    expect(
      indexes,
      containsAll([
        'expense_notebook_updated',
        'expense_notebook_date',
        'category_notebook_updated',
      ]),
    );
  });

  test('migration 2 → 3 : colonne sync_error ajoutée, file d’envoi gardée', () async {
    final dir = Directory.systemTemp.createTempSync('depenseo-mig-');
    addTearDown(() => dir.deleteSync(recursive: true));
    final file = File('${dir.path}/v2.sqlite');
    sqlite3.open(file.path)
      ..execute(
        'CREATE TABLE app_meta (key TEXT NOT NULL, value TEXT NOT NULL, '
        'PRIMARY KEY (key))',
      )
      ..execute(
        'CREATE TABLE expenses (id TEXT NOT NULL, notebook_id TEXT NOT NULL, '
        'amount INTEGER NOT NULL, currency TEXT NOT NULL, '
        'category_id TEXT NOT NULL, date TEXT NOT NULL, note TEXT NULL, '
        "merchant TEXT NULL, tags TEXT NOT NULL DEFAULT '[]', "
        'created_at TEXT NOT NULL, updated_at TEXT NOT NULL, '
        'deleted_at TEXT NULL, pending_sync INTEGER NOT NULL DEFAULT 1, '
        'PRIMARY KEY (id))',
      )
      ..execute(
        'INSERT INTO expenses (id, notebook_id, amount, currency, category_id, '
        "date, created_at, updated_at) VALUES ('e', 'n', 5, 'EUR', 'c', "
        "'2026-11-05', '2026-11-05T09:00:00.000Z', '2026-11-05T09:00:00.000Z')",
      )
      ..execute('PRAGMA user_version = 2')
      ..close();

    final db = AppDatabase(NativeDatabase(file));
    addTearDown(db.close);
    final row = await db.select(db.expenses).getSingle();
    expect(
      (row.id, row.pendingSync, row.syncError, row.baseUpdatedAt),
      ('e', true, null, null),
    );
  });
}
