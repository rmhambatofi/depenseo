// Suppression du compte avec confirmation (P6-12 ; F-AUTH-07 ; ADR-037/057).
import 'package:depenseo/features/notifications/push_registration.dart'
    show deviceIdKey;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import 'account_harness.dart';

Future<void> openDialog(WidgetTester tester) async {
  await tester.ensureVisible(byKey('delete-account'));
  await tester.tap(byKey('delete-account'));
  await tester.pumpAndSettle();
}

bool confirmEnabled(WidgetTester tester) =>
    tester.widget<FilledButton>(byKey('delete-confirm')).onPressed != null;

void main() {
  testWidgets('confirmation exigée : bouton inactif sans le mot, annuler', (
    tester,
  ) async {
    final app = await openAccount(tester);

    await openDialog(tester);
    expect(find.textContaining('irréversible'), findsOneWidget);
    expect(confirmEnabled(tester), isFalse);
    await tester.enterText(byKey('delete-confirm-field'), 'supprime');
    await tester.pump();
    expect(confirmEnabled(tester), isFalse);
    await tester.enterText(byKey('delete-confirm-field'), ' supprimer ');
    await tester.pump();
    expect(confirmEnabled(tester), isTrue);

    await tester.tap(byKey('delete-cancel'));
    await tester.pumpAndSettle();
    expect(app.api.calls('DELETE /me'), isEmpty);
    expect(await app.tokens.read(), isNotNull);
  });

  testWidgets('suppression : DELETE /me, session et données locales effacées', (
    tester,
  ) async {
    final app = await openAccount(
      tester,
      configure: (app) {
        app.api.on('DELETE /me', (_) => const FakeResponse(204));
        app.store.write(deviceIdKey, '0190a000-0000-7000-8000-0000000000de');
      },
    );
    final db = await database(app, tester);
    expect(await io(tester, () => db.select(db.categories).get()), isNotEmpty);

    await openDialog(tester);
    await tester.enterText(byKey('delete-confirm-field'), 'SUPPRIMER');
    await tester.pump();
    await tapUntil(tester, 'delete-confirm', () => app.location == '/login');

    expect(app.api.calls('DELETE /me'), hasLength(1));
    // Appareils supprimés avec le compte : ni retrait ni réenregistrement.
    expect(
      app.api.requests.where((r) => r.path.startsWith('/me/devices')),
      isEmpty,
    );
    expect(await app.store.read(deviceIdKey), isNull);
    // Jetons déjà invalides côté serveur : aucune révocation demandée.
    expect(app.api.calls('POST /auth/logout'), isEmpty);
    expect(await app.tokens.read(), isNull);
    expect(app.files.cleared, 1);
    for (final rows in [
      await io(tester, () => db.select(db.categories).get()),
      await io(tester, () => db.select(db.expenses).get()),
      await io(tester, () => db.select(db.appMeta).get()),
    ]) {
      expect(rows, isEmpty);
    }
    expect(snack('Votre compte a été supprimé'), findsOneWidget);
  });

  testWidgets('échec serveur : compte conservé, message', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) => app.api.on(
        'DELETE /me',
        (_) => FakeResponse.problem(500, 'Server error'),
      ),
    );

    await openDialog(tester);
    await tester.enterText(byKey('delete-confirm-field'), 'SUPPRIMER');
    await tester.pump();
    await tapUntil(
      tester,
      'delete-confirm',
      () => snack('La suppression a échoué').evaluate().isNotEmpty,
    );

    expect(byKey('delete-account'), findsOneWidget);
    expect(await app.tokens.read(), isNotNull);
    final db = await database(app, tester);
    expect(await io(tester, () => db.select(db.categories).get()), isNotEmpty);
  });

  testWidgets('anglais : mot de confirmation DELETE', (tester) async {
    await openAccount(tester, locale: const Locale('en'));

    await openDialog(tester);
    await tester.enterText(byKey('delete-confirm-field'), 'SUPPRIMER');
    await tester.pump();
    expect(confirmEnabled(tester), isFalse);
    await tester.enterText(byKey('delete-confirm-field'), 'delete');
    await tester.pump();
    expect(confirmEnabled(tester), isTrue);
  });

  testWidgets('déconnexion : copies d’export effacées', (tester) async {
    final app = await openAccount(tester);
    app.router.go('/');
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Se déconnecter'));
    await settleUntil(tester, () => app.location == '/login');

    expect(app.files.cleared, 1);
  });
}
