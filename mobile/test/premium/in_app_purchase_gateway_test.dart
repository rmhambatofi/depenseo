// Preuve d'achat extraite des objets in_app_purchase (ADR-040, ADR-058).
import 'package:depenseo/core/premium/in_app_purchase_gateway.dart';
import 'package:depenseo/core/premium/store_gateway.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

PurchaseDetails _details({String? purchaseID, String serverData = ''}) =>
    PurchaseDetails(
      purchaseID: purchaseID,
      productID: 'premium_monthly',
      verificationData: PurchaseVerificationData(
        localVerificationData: '',
        serverVerificationData: serverData,
        source: 'test',
      ),
      transactionDate: null,
      status: PurchaseStatus.purchased,
    );

void main() {
  test('App Store : identifiant de transaction StoreKit 2', () {
    final proof = proofFor(
      _details(purchaseID: '2000000123', serverData: 'jws'),
      appStore: true,
    );
    expect(proof?.toJson(), {
      'store': 'app_store',
      'transactionId': '2000000123',
    });
  });

  test('Google Play : jeton d’achat', () {
    final proof = proofFor(
      _details(purchaseID: 'GPA.1', serverData: 'token'),
      appStore: false,
    );
    expect(proof?.toJson(), {'store': 'google_play', 'purchaseToken': 'token'});
  });

  test('sans identifiant : aucune preuve', () {
    expect(proofFor(_details(), appStore: true), isNull);
    expect(proofFor(_details(), appStore: false), isNull);
  });

  test('statuts et produit repris', () {
    final p = toStorePurchase(_details(purchaseID: '1'), appStore: true);
    expect(p.productId, 'premium_monthly');
    expect(p.status, StorePurchaseStatus.purchased);
    expect(statusOf(PurchaseStatus.restored), StorePurchaseStatus.restored);
    expect(statusOf(PurchaseStatus.canceled), StorePurchaseStatus.canceled);
  });

  test('Play : une entrée par produit, forfait de base retenu', () {
    final offers = [
      (id: 'premium_monthly', offer: 'promo'),
      (id: 'premium_monthly', offer: null),
      (id: 'premium_yearly', offer: 'promo'),
    ];
    final kept = onePerProduct(offers, (o) => o.id, (o) => o.offer == null);
    expect(kept, [
      (id: 'premium_monthly', offer: null),
      (id: 'premium_yearly', offer: 'promo'),
    ]);
  });
}
