// Achat Premium par le store, vérifié par l'API, essai de 14 jours et lien de
// résiliation (F-ABO-01, F-ABO-02, §5, ADR-058).
import 'package:depenseo/core/premium/store_gateway.dart';
import 'package:flutter_test/flutter_test.dart';

import 'premium_harness.dart';

void main() {
  final free = statusJson('free', trialAvailable: true);

  testWidgets('offre gratuite : essai proposé, produits du store avec prix', (
    tester,
  ) async {
    await openSubscription(tester, status: free);

    expect(planText(tester), 'Offre gratuite');
    expect(find.textContaining('lecture seule'), findsOneWidget);
    expect(byKey('start-trial'), findsOneWidget);
    expect(byKey('buy-premium_monthly'), findsOneWidget);
    expect(find.text('19,99 €'), findsOneWidget);
    // Gestion du store toujours accessible (§5).
    expect(byKey('manage-subscription'), findsOneWidget);
  });

  testWidgets('achat : identifiant du compte transmis au store, transaction '
      'vérifiée par l’API puis close, Premium affiché', (tester) async {
    final (app, server) = await openSubscription(tester, status: free);

    await tester.tap(byKey('buy-premium_yearly'));
    await tester.pumpAndSettle();
    expect(app.storeGateway.buys.single, (
      productId: 'premium_yearly',
      accountId: userId,
    ));
    // Rien n'est accordé avant la vérification par l'API.
    expect(planText(tester), 'Offre gratuite');

    await deliver(tester, app, [
      purchase(StorePurchaseStatus.purchased, productId: 'premium_yearly'),
    ], done: () => snack('Premium activé. Merci !').evaluate().isNotEmpty);

    expect(server.proofs.single, {
      'store': 'app_store',
      'transactionId': '2000000123456789',
    });
    expect(app.storeGateway.completed, hasLength(1));
    expect(planText(tester), 'Premium jusqu’au 5 déc. 2026');
    expect(byKey('start-trial'), findsNothing);
    expect(byKey('buy-premium_monthly'), findsNothing);
  });

  testWidgets('Google Play : le jeton d’achat est présenté', (tester) async {
    final (app, server) = await openSubscription(tester, status: free);

    await deliver(tester, app, [
      purchase(
        StorePurchaseStatus.purchased,
        proof: const GooglePlayProof('play-token'),
      ),
    ], done: () => server.proofs.isNotEmpty);

    expect(server.proofs.single, {
      'store': 'google_play',
      'purchaseToken': 'play-token',
    });
  });

  testWidgets('API injoignable (503) : transaction laissée ouverte pour être '
      'redélivrée, droits inchangés', (tester) async {
    final (app, server) = await openSubscription(tester, status: free);
    server.verifyStatus = 503;

    await deliver(
      tester,
      app,
      [purchase(StorePurchaseStatus.purchased)],
      done: () => snack(
        'Vérification impossible pour l’instant : elle sera retentée '
        'automatiquement.',
      ).evaluate().isNotEmpty,
    );

    expect(app.storeGateway.completed, isEmpty);
    expect(planText(tester), 'Offre gratuite');
  });

  testWidgets('reçu invalide (400) : transaction close, message', (
    tester,
  ) async {
    final (app, server) = await openSubscription(tester, status: free);
    server.verifyStatus = 400;

    await deliver(
      tester,
      app,
      [purchase(StorePurchaseStatus.purchased)],
      done: () =>
          snack('Cet achat n’a pas pu être vérifié.').evaluate().isNotEmpty,
    );

    expect(app.storeGateway.completed, hasLength(1));
    expect(planText(tester), 'Offre gratuite');
  });

  testWidgets('achat en attente puis annulé : rien n’est présenté à l’API', (
    tester,
  ) async {
    final (app, server) = await openSubscription(tester, status: free);

    await deliver(
      tester,
      app,
      [purchase(StorePurchaseStatus.pending)],
      done: () =>
          snack('Achat en attente de validation par le store.')
              .evaluate()
              .isNotEmpty,
    );
    await deliver(tester, app, [
      purchase(StorePurchaseStatus.canceled),
    ], done: () => app.storeGateway.completed.isNotEmpty);

    expect(server.proofs, isEmpty);
    expect(planText(tester), 'Offre gratuite');
  });

  testWidgets('essai de 14 jours : sans store, dernier jour inclus affiché '
      'dans le fuseau du compte', (tester) async {
    // Début le 5 nov. à La Réunion : fin = minuit local au début du jour 15.
    final (app, server) = await openSubscription(
      tester,
      timeZone: 'Indian/Reunion',
      status: free,
      trial: statusJson('trial', trialEndsAt: '2026-11-18T20:00:00.000Z'),
    );

    await tapUntil(
      tester,
      'start-trial',
      () => snack('Essai Premium activé.').evaluate().isNotEmpty,
    );

    expect(app.api.calls('POST /subscriptions/trial'), hasLength(1));
    expect(app.storeGateway.buys, isEmpty);
    expect(planText(tester), 'Essai Premium jusqu’au 18 nov. 2026 inclus');
    expect(byKey('start-trial'), findsNothing);
    // L'achat reste possible pendant l'essai.
    expect(byKey('buy-premium_monthly'), findsOneWidget);
  });

  testWidgets('essai déjà consommé (409) : message, état relu', (tester) async {
    final (app, _) = await openSubscription(tester, status: free);

    await tapUntil(
      tester,
      'start-trial',
      () =>
          snack('L’essai gratuit a déjà été utilisé sur ce compte.')
              .evaluate()
              .isNotEmpty,
    );

    expect(app.api.calls('GET /subscriptions').length, greaterThan(1));
  });

  testWidgets('Premium : résiliation en un clic vers le store (§5)', (
    tester,
  ) async {
    final (app, _) = await openSubscription(
      tester,
      status: statusJson('premium', premiumUntil: '2026-12-05T10:00:00.000Z'),
    );

    await tapUntil(
      tester,
      'manage-subscription',
      () => app.openedUrls.isNotEmpty,
    );

    expect(
      app.openedUrls.single,
      Uri.parse('https://apps.apple.com/account/subscriptions'),
    );
  });
}
