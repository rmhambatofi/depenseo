// Harnais Premium (P6-13, ADR-058) : faux serveur `/subscriptions` dont l'état
// change avec l'essai et les achats vérifiés, faux store (`TestApp.storeGateway`).
import 'package:depenseo/core/premium/store_gateway.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../account/account_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

export '../account/account_harness.dart'
    show ExportServer, byKey, openAccount, snack, tapUntil;
export '../expenses/quick_entry_harness.dart' show notebookId;

const userId = '0190a000-0000-7000-8000-0000000000aa';

Map<String, dynamic> statusJson(
  String plan, {
  String? premiumUntil,
  String? trialEndsAt,
  bool trialAvailable = false,
}) => {
  'plan': plan,
  'premiumUntil': premiumUntil,
  'trialEndsAt': trialEndsAt,
  'trialAvailable': trialAvailable,
};

/// Serveur d'abonnement : [status] courant, [verify] décide de la réponse à
/// une preuve (200 → [afterVerify] devient l'état).
class SubscriptionServer {
  SubscriptionServer(
    this.app, {
    required this.status,
    this.trial,
    this.verifyStatus = 200,
    Map<String, dynamic>? afterVerify,
  }) : afterVerify =
           afterVerify ??
           statusJson('premium', premiumUntil: '2026-12-05T10:00:00.000Z') {
    app.api
      ..on('GET /subscriptions', (_) => FakeResponse(200, status))
      ..on('POST /subscriptions/trial', (_) {
        final next = trial;
        if (next == null) return FakeResponse.problem(409, 'Trial used');
        status = next;
        return FakeResponse(200, status);
      })
      ..on('POST /subscriptions/verify', (req) {
        proofs.add(req.body! as Map<String, dynamic>);
        if (verifyStatus != 200) {
          return FakeResponse.problem(verifyStatus, 'Refused');
        }
        status = this.afterVerify;
        return FakeResponse(200, status);
      });
  }

  final TestApp app;
  Map<String, dynamic> status;
  Map<String, dynamic>? trial;
  int verifyStatus;
  Map<String, dynamic> afterVerify;
  final List<Map<String, dynamic>> proofs = [];
}

StorePurchase purchase(
  StorePurchaseStatus status, {
  String productId = 'premium_monthly',
  PurchaseProof? proof = const AppStoreProof('2000000123456789'),
}) => StorePurchase(productId: productId, status: status, proof: proof);

/// Ouvre Compte puis Abonnement, l'état servi par [server].
Future<(TestApp, SubscriptionServer)> openSubscription(
  WidgetTester tester, {
  required Map<String, dynamic> status,
  Map<String, dynamic>? trial,
  String timeZone = 'Europe/Paris',
  Locale locale = const Locale('fr'),
  void Function(TestApp app)? configure,
  Finder? until,
}) async {
  late SubscriptionServer server;
  final app = await openAccount(
    tester,
    timeZone: timeZone,
    locale: locale,
    configure: (app) {
      server = SubscriptionServer(app, status: status, trial: trial);
      configure?.call(app);
    },
  );
  final open = find.byKey(const Key('open-subscription'));
  // Liste paresseuse : à texte ×2, la ligne n'est pas encore construite.
  await reveal(tester, 'open-subscription');
  await tester.ensureVisible(open);
  await tester.pump();
  await tester.tap(open);
  await settle(tester, until ?? find.byKey(const Key('plan-status')));
  return (app, server);
}

/// Livre des achats du store puis laisse aboutir la vérification.
Future<void> deliver(
  WidgetTester tester,
  TestApp app,
  List<StorePurchase> purchases, {
  required bool Function() done,
}) async {
  app.storeGateway.deliver(purchases);
  await settleUntil(tester, done);
}

String planText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('plan-status'))).data!;

/// Réponse 200 du faux serveur (routes redéfinies dans un test).
FakeResponse ok(Object body) => FakeResponse(200, body);
