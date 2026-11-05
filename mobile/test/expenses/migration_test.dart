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
}
