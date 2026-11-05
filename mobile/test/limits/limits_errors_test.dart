// Écran des limites : erreurs, session, rejeu (P6-08, ADR-053).
import 'dart:async';

import 'package:depenseo/core/account/account_epoch.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import 'limit_harness.dart';

void main() {
  testWidgets('montant invalide : message, aucune requête', (tester) async {
    final (app, _) = await openLimits(tester, current: summary());
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await saveLimit(tester);
    await tester.pumpAndSettle();
    expect(find.text('Saisissez un montant.'), findsOneWidget);
    await tester.enterText(byKey('limit-amount'), '0');
    await saveLimit(tester);
    await tester.pumpAndSettle();
    expect(app.api.calls('POST $base'), isEmpty);
  });

  testWidgets('conflit (version créée ailleurs ce jour) : message puis '
      'rechargement', (tester) async {
    final (app, _) = await openLimits(tester, current: summary());
    app.api.on(
      'POST $base',
      (_) => FakeResponse.problem(409, 'Une limite a déjà été définie'),
    );
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '300');
    final reads = app.api.calls('GET $base/current').length;
    await saveLimit(tester);
    await settle(
      tester,
      find.text(
        'La limite a changé entre-temps : vérifiez puis enregistrez à nouveau.',
      ),
    );
    expect(app.api.calls('GET $base/current').length, greaterThan(reads));
  });

  testWidgets('hors ligne : connexion requise puis réessai', (tester) async {
    final app = await startSignedIn(tester);
    app.api.on('GET $base/current', (_) => throw Exception('réseau'));
    await tester.tap(byKey('open-settings'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('open-limits'));
    await settle(tester, byKey('limit-offline'));
    expect(
      find.text('Connexion requise pour consulter ou modifier la limite.'),
      findsOneWidget,
    );
    LimitServer(app, current: summary(limit: 50000), versions: [version()]);
    await tester.tap(byKey('limit-retry'));
    await settle(tester, byKey('limit-pace'));
  });

  testWidgets('400 : réglage refusé', (tester) async {
    final (app, _) = await openLimits(tester, current: summary());
    app.api.on(
      'POST $base',
      (_) => FakeResponse.problem(400, 'Corps invalide'),
    );
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '300');
    await saveLimit(tester);
    await settle(tester, find.text('Réglage refusé : vérifiez les champs.'));
  });

  for (final status in [409, 404]) {
    testWidgets('PATCH $status (version passée ou disparue) : conflit, '
        'rechargement', (tester) async {
      const todayId = '0190a000-0000-7000-8000-000000000200';
      final (app, _) = await openLimits(
        tester,
        current: summary(limit: 50000),
        versions: [version(id: todayId, effectiveDate: today)],
      );
      app.api.on(
        'PATCH $base/$todayId',
        (_) => FakeResponse.problem(status, 'Version passée'),
      );
      final reads = app.api.calls('GET $base/current').length;
      await tester.enterText(byKey('limit-amount'), '300');
      await saveLimit(tester);
      await settle(
        tester,
        find.text(
          'La limite a changé entre-temps : vérifiez puis enregistrez à '
          'nouveau.',
        ),
      );
      expect(app.api.calls('GET $base/current').length, greaterThan(reads));
    });
  }

  testWidgets('autre session pendant l’écriture : aucun succès annoncé', (
    tester,
  ) async {
    final (app, server) = await openLimits(tester, current: summary());
    app.api.on('POST $base', (r) async {
      await app.store.write(AccountEpoch.key, 'autre-session');
      return FakeResponse(201, {
        ...version(id: (r.body! as Map)['id'] as String, effectiveDate: today),
      });
    });
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '300');
    await saveLimit(tester);
    await settle(tester, snack('Connexion requise'));
    expect(find.text('Limite enregistrée.'), findsNothing);
  });

  testWidgets('réponse perdue puis nouvel essai : même identifiant (rejeu '
      'idempotent)', (tester) async {
    final (app, server) = await openLimits(tester, current: summary());
    var lost = true;
    app.api.on('POST $base', (r) {
      if (lost) {
        lost = false;
        throw Exception('réseau');
      }
      return FakeResponse(
        201,
        version(id: (r.body! as Map)['id'] as String, effectiveDate: today),
      );
    });
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '300');
    await saveLimit(tester);
    await settle(tester, snack('Connexion requise'));
    // Le rechargement n'a rien changé : même formulaire.
    await saveLimit(tester);
    await settleUntil(tester, () => app.api.calls('POST $base').length == 2);
    final ids = app.api
        .calls('POST $base')
        .map((r) => (r.body! as Map)['id'])
        .toList();
    expect(ids.first, matches(uuidV7));
    expect(ids.last, ids.first);
  });

  testWidgets('rechargement en échec après enregistrement : jauge signalée '
      'périmée', (tester) async {
    final (app, _) = await openLimits(tester, current: summary());
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '300');
    app.api.on('GET $base/current', (_) => throw Exception('réseau'));
    await saveLimit(tester);
    await settle(tester, byKey('limit-stale'));
    expect(byKey('limit-summary'), findsOneWidget);
    // Réglages peut-être périmés : pas de nouvel enregistrement (un rejeu
    // de la même création perdrait la saisie sans le dire).
    expect(tester.widget<FilledButton>(byKey('save-limit')).onPressed, isNull);
  });

  testWidgets('écran fermé pendant l’enregistrement : aucune erreur', (
    tester,
  ) async {
    final (app, _) = await openLimits(tester, current: summary());
    final reply = Completer<FakeResponse>();
    app.api.on('POST $base', (_) => reply.future);
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '300');
    await saveLimit(tester);
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    reply.complete(FakeResponse(201, version(effectiveDate: today)));
    await settle(tester, snack('Limite enregistrée.'));
    expect(tester.takeException(), isNull);
  });
}
