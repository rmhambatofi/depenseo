@Tags(['tz'])
library;

import 'package:depenseo/features/expenses/expense_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/test_app.dart';
import 'quick_entry_harness.dart';

/// Contexte du compte de la saisie rapide : fuseau, hors ligne, changement de compte.
void main() {
  // 05/11 09:00 UTC + 19 h = 06/11 04:00 UTC (NF-FMT-04, NF-FMT-05).
  for (final (zone, expected) in [
    ('Indian/Reunion', '2026-11-06'),
    ('Europe/Paris', '2026-11-06'),
    ('Europe/Lisbon', '2026-11-06'),
    ('America/Montreal', '2026-11-05'),
  ]) {
    testWidgets('date par défaut = aujourd\'hui à $zone', (tester) async {
      final app = await startSignedIn(tester, timeZone: zone);
      app.clock.advance(const Duration(hours: 19));
      await openQuickEntry(tester);
      expect(find.text('Aujourd\'hui'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('expense-amount')), '1');
      await tester.tap(find.byKey(const Key('category-$food')));
      await tester.pump();
      await save(tester);
      expect((await expenses(app, tester)).single.date, expected);
    });
  }

  testWidgets('hors ligne : contexte relu depuis la base locale', (
    tester,
  ) async {
    final app = await startSignedIn(tester);
    app.api
      ..on('GET /me', (_) => throw Exception('offline'))
      ..on('GET /notebooks', (_) => throw Exception('offline'));
    app.container.invalidate(accountContextProvider);
    await pumpIo(tester);
    await openQuickEntry(tester);
    await tester.enterText(find.byKey(const Key('expense-amount')), '2');
    await tester.tap(find.byKey(const Key('category-$food')));
    await tester.pump();
    await save(tester);
    final e = (await expenses(app, tester)).single;
    expect((e.amount, e.notebookId), (200, notebookId));
  });

  testWidgets('changement de compte hors ligne : le carnet du compte précédent '
      'n\'est jamais resservi', (tester) async {
    final app = TestApp();
    app.api
      ..on('POST /auth/login', (_) => FakeResponse(200, tokenBody('b', 'rb')))
      ..on('GET /me', (_) => throw Exception('offline'))
      ..on('GET /notebooks', (_) => throw Exception('offline'));
    await app.pump(tester);
    // Copie laissée par le compte A (déconnexion interrompue, par exemple).
    final db = await database(app, tester);
    await app.store.write('account.epoch', 'epoch-a');
    for (final (k, v) in [
      ('account.epoch', 'epoch-a'),
      ('account.user_id', 'user-a'),
      ('account.notebook_id', notebookId),
      ('account.currency', 'EUR'),
      ('account.time_zone', 'Europe/Paris'),
    ]) {
      await io(tester, () => db.writeMeta(k, v));
    }

    await enter(tester, 'email', 'b@example.org');
    await enter(tester, 'password', 'correct horse');
    await tester.tap(find.widgetWithText(FilledButton, 'Se connecter'));
    await pumpIo(tester, until: find.byKey(const Key('add-expense')));
    await openQuickEntryUntil(
      tester,
      find.text(
        'Connectez-vous à Internet une première fois pour préparer la saisie.',
      ),
    );
    expect(await app.store.read('account.epoch'), isNot('epoch-a'));
  });
}
