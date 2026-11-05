// Restauration, accès multi-appareils lié au compte et lecture seule à
// expiration (F-ABO-03, §5, ADR-041, ADR-058).
import 'package:depenseo/core/premium/store_gateway.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/settle.dart';
import 'premium_harness.dart';

void main() {
  testWidgets('restaurer : achats du compte store redélivrés, vérifiés par '
      'l’API puis clos', (tester) async {
    final (app, server) = await openSubscription(
      tester,
      status: statusJson('free'),
      configure: (app) => app.storeGateway.restorable = [
        purchase(StorePurchaseStatus.restored),
      ],
    );

    await tapUntil(
      tester,
      'restore-purchases',
      () => snack('Achat restauré.').evaluate().isNotEmpty,
    );

    expect(app.storeGateway.restores.single, userId);
    expect(server.proofs.single['transactionId'], '2000000123456789');
    expect(app.storeGateway.completed, hasLength(1));
    expect(planText(tester), 'Premium jusqu’au 5 déc. 2026');
  });

  testWidgets('achat lié à un autre compte (409) : refusé, message', (
    tester,
  ) async {
    final (app, server) = await openSubscription(
      tester,
      status: statusJson('free'),
      configure: (app) => app.storeGateway.restorable = [
        purchase(StorePurchaseStatus.restored),
      ],
    );
    server.verifyStatus = 409;

    await tapUntil(
      tester,
      'restore-purchases',
      () =>
          snack('Cet achat est déjà lié à un autre compte Depenseo.')
              .evaluate()
              .isNotEmpty,
    );

    expect(planText(tester), 'Offre gratuite');
  });

  testWidgets('autre appareil : Premium lu sur le compte, sans achat local', (
    tester,
  ) async {
    final (app, _) = await openSubscription(
      tester,
      status: statusJson('premium', premiumUntil: '2027-11-05T09:30:00.000Z'),
    );

    expect(planText(tester), 'Premium jusqu’au 5 nov. 2027');
    expect(app.storeGateway.buys, isEmpty);
    expect(app.storeGateway.restores, isEmpty);
  });

  testWidgets('expiré : Excel en lecture seule (désactivé, CSV retenu), '
      'données et CSV toujours disponibles', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) {
        SubscriptionServer(app, status: statusJson('free'));
        ExportServer(
          app,
          create: 'POST /notebooks/$notebookId/exports',
          base: '/notebooks/$notebookId/exports',
        );
      },
    );
    await settle(tester, byKey('excel-locked'));

    expect(find.text('Export Excel réservé à Premium.'), findsOneWidget);
    await tester.tap(find.text('Excel (Premium)'));
    await tester.pumpAndSettle();
    await tapUntil(
      tester,
      'export-expenses',
      () => app.files.shared.isNotEmpty,
    );

    final body =
        app.api.calls('POST /notebooks/$notebookId/exports').single.body!
            as Map;
    expect(body['format'], 'csv');
    expect(find.text('Offre gratuite'), findsOneWidget);
  });

  testWidgets('Premium actif : Excel disponible', (tester) async {
    await openAccount(
      tester,
      configure: (app) => SubscriptionServer(
        app,
        status: statusJson('trial', trialEndsAt: '2026-11-18T23:00:00.000Z'),
      ),
    );
    await settle(tester, find.text('Essai Premium'));

    expect(byKey('excel-locked'), findsNothing);
  });
}
