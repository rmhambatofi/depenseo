// Achats traités hors de l'écran Abonnement : écoute dès le démarrage,
// transactions non closes reprises à l'ouverture de session et au retour au
// premier plan, rien hors session (F-ABO-01, F-ABO-03, ADR-058).
import 'package:depenseo/core/premium/store_gateway.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart' show startSignedIn;
import '../lock/app_lock_test.dart' show toBackground, toForeground;
import '../support/settle.dart';
import '../support/test_app.dart';
import 'premium_harness.dart';

void main() {
  testWidgets('achat livré à l’accueil, écran Abonnement fermé : vérifié '
      'puis clos', (tester) async {
    late SubscriptionServer server;
    final app = await startSignedIn(
      tester,
      configure: (app) =>
          server = SubscriptionServer(app, status: statusJson('free')),
    );

    await deliver(tester, app, [
      purchase(StorePurchaseStatus.purchased),
    ], done: () => app.storeGateway.completed.isNotEmpty);

    expect(server.proofs, hasLength(1));
  });

  testWidgets('hors session : achat ni présenté ni clos', (tester) async {
    final app = TestApp();
    final server = SubscriptionServer(app, status: statusJson('free'));
    await app.pump(tester);
    expect(app.location, isNot('/'));

    app.storeGateway.deliver([purchase(StorePurchaseStatus.purchased)]);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(server.proofs, isEmpty);
    expect(app.storeGateway.completed, isEmpty);
  });

  testWidgets('statut « error » : clos sans présentation, message', (
    tester,
  ) async {
    final (app, server) = await openSubscription(
      tester,
      status: statusJson('free'),
    );

    await deliver(tester, app, [
      purchase(StorePurchaseStatus.error, proof: null),
    ], done: () => snack('L’achat n’a pas abouti.').evaluate().isNotEmpty);

    expect(app.storeGateway.completed, hasLength(1));
    expect(server.proofs, isEmpty);
  });

  testWidgets('réseau absent : achat laissé ouvert puis repris au retour au '
      'premier plan', (tester) async {
    final (app, server) = await openSubscription(
      tester,
      status: statusJson('free'),
    );
    final bought = purchase(StorePurchaseStatus.purchased);
    app.storeGateway.open = [bought];
    var offline = true;
    app.api.on('POST /subscriptions/verify', (req) {
      if (offline) throw Exception('offline');
      server.status = server.afterVerify;
      return ok(server.status);
    });

    await deliver(
      tester,
      app,
      [bought],
      done: () => snack(
        'Vérification impossible pour l’instant : elle sera retentée '
        'automatiquement.',
      ).evaluate().isNotEmpty,
    );
    expect(app.storeGateway.completed, isEmpty);

    offline = false;
    await toBackground(tester);
    await toForeground(tester);
    await settleUntil(tester, () => app.storeGateway.completed.isNotEmpty);

    expect(app.storeGateway.open, isEmpty);
    expect(planText(tester), 'Premium jusqu’au 5 déc. 2026');
  });

  testWidgets('même achat livré par le flux puis par la reprise (retour de '
      'la feuille d’achat) : présenté une seule fois', (tester) async {
    final (app, server) = await openSubscription(
      tester,
      status: statusJson('free'),
    );
    final bought = purchase(StorePurchaseStatus.purchased);

    await deliver(tester, app, [
      bought,
    ], done: () => app.storeGateway.completed.isNotEmpty);
    // Copie périmée encore rendue par le store au retour au premier plan.
    app.storeGateway.open = [purchase(StorePurchaseStatus.purchased)];
    await toBackground(tester);
    await toForeground(tester);
    await settleUntil(tester, () => app.storeGateway.completed.length == 2);

    expect(server.proofs, hasLength(1));
  });

  testWidgets('ouverture de session : transaction non close (achat Play non '
      'acquitté) reprise, vérifiée puis close', (tester) async {
    late SubscriptionServer server;
    final pending = purchase(
      StorePurchaseStatus.purchased,
      proof: const GooglePlayProof('unacknowledged'),
    );
    final app = await startSignedIn(
      tester,
      configure: (app) {
        server = SubscriptionServer(app, status: statusJson('free'));
        app.storeGateway.open = [pending];
      },
    );
    await settleUntil(tester, () => app.storeGateway.completed.isNotEmpty);

    expect(server.proofs.single['purchaseToken'], 'unacknowledged');
    expect(app.storeGateway.open, isEmpty);
  });

  testWidgets('droits illisibles (hors ligne) : restauration et résiliation '
      'restent accessibles', (tester) async {
    final (app, _) = await openSubscription(
      tester,
      status: statusJson('free'),
      configure: (app) =>
          app.api.on('GET /subscriptions', (_) => throw Exception('offline')),
      until: byKey('subscription-offline'),
    );

    expect(
      find.text('Abonnement indisponible hors connexion.'),
      findsOneWidget,
    );
    expect(byKey('restore-purchases'), findsOneWidget);
    await tapUntil(
      tester,
      'manage-subscription',
      () => app.openedUrls.isNotEmpty,
    );
  });

  group('échéances dans le fuseau du compte (NF-FMT-05)', () {
    testWidgets('Europe/Paris : essai commencé avant le passage à l’heure '
        'd’hiver, dernier jour inclus correct', (tester) async {
      // Début le 21 oct. (UTC+2) ; fin = 4 nov. 00:00 heure d'hiver (UTC+1).
      await openSubscription(
        tester,
        status: statusJson('trial', trialEndsAt: '2026-11-03T23:00:00.000Z'),
      );
      expect(planText(tester), 'Essai Premium jusqu’au 3 nov. 2026 inclus');
    }, tags: 'tz');

    testWidgets('America/Montreal : échéance UTC du lendemain affichée la '
        'veille', (tester) async {
      await openSubscription(
        tester,
        timeZone: 'America/Montreal',
        status: statusJson('premium', premiumUntil: '2026-12-06T03:00:00.000Z'),
      );
      expect(planText(tester), 'Premium jusqu’au 5 déc. 2026');
    }, tags: 'tz');

    testWidgets('Europe/Lisbon, anglais : fin d’essai à minuit UTC', (
      tester,
    ) async {
      await openSubscription(
        tester,
        timeZone: 'Europe/Lisbon',
        locale: const Locale('en'),
        status: statusJson('trial', trialEndsAt: '2026-11-19T00:00:00.000Z'),
      );
      expect(planText(tester), 'Premium trial until Nov 18, 2026 (included)');
    }, tags: 'tz');
  });
}
