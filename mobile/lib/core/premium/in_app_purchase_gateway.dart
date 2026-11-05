import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';
import 'package:in_app_purchase_storekit/store_kit_2_wrappers.dart';

import 'store_gateway.dart';

/// Paquet Android / identifiant de bundle iOS (lien de gestion Play).
const _packageName = 'fr.depenseo.depenseo';

/// Store de la plateforme, ou [UnavailableStoreGateway] hors iOS/Android.
StoreGateway platformStoreGateway() => switch (defaultTargetPlatform) {
  TargetPlatform.iOS => InAppPurchaseGateway(appStore: true),
  TargetPlatform.android => InAppPurchaseGateway(appStore: false),
  _ => const UnavailableStoreGateway(),
};

/// Preuve à présenter à l'API : identifiant de transaction StoreKit 2
/// (`purchaseID`) ou jeton d'achat Play (`serverVerificationData`).
PurchaseProof? proofFor(PurchaseDetails details, {required bool appStore}) {
  if (appStore) {
    final id = details.purchaseID;
    return id == null || id.isEmpty ? null : AppStoreProof(id);
  }
  final token = details.verificationData.serverVerificationData;
  return token.isEmpty ? null : GooglePlayProof(token);
}

StorePurchaseStatus statusOf(PurchaseStatus status) => switch (status) {
  PurchaseStatus.pending => StorePurchaseStatus.pending,
  PurchaseStatus.purchased => StorePurchaseStatus.purchased,
  PurchaseStatus.restored => StorePurchaseStatus.restored,
  PurchaseStatus.canceled => StorePurchaseStatus.canceled,
  PurchaseStatus.error => StorePurchaseStatus.error,
};

StorePurchase toStorePurchase(
  PurchaseDetails details, {
  required bool appStore,
}) => StorePurchase(
  productId: details.productID,
  status: statusOf(details.status),
  proof: proofFor(details, appStore: appStore),
  handle: details,
);

/// in_app_purchase (StoreKit 2 par défaut sur iOS, Play Billing sur Android).
/// L'identifiant du compte est passé en `applicationUserName`, transmis par
/// le plugin en `appAccountToken` (iOS) et `obfuscatedAccountId` (Android).
class InAppPurchaseGateway implements StoreGateway {
  InAppPurchaseGateway({required this.appStore});

  final bool appStore;
  final Map<String, ProductDetails> _details = {};

  InAppPurchase get _iap => InAppPurchase.instance;

  @override
  Stream<List<StorePurchase>> get purchases => _iap.purchaseStream.map(
    (list) => [for (final d in list) toStorePurchase(d, appStore: appStore)],
  );

  @override
  Future<List<StoreProduct>> products() async {
    if (!await _iap.isAvailable()) return const [];
    final res = await _iap.queryProductDetails(premiumProductIds);
    final products = onePerProduct(
      res.productDetails,
      (p) => p.id,
      _isBasePlan,
    );
    for (final p in products) {
      _details[p.id] = p;
    }
    return [
      for (final p in products)
        StoreProduct(id: p.id, title: p.title, price: p.price),
    ];
  }

  @override
  Future<bool> buy(String productId, {required String accountId}) async {
    final details = _details[productId];
    if (details == null) return false;
    return _iap.buyNonConsumable(
      purchaseParam: PurchaseParam(
        productDetails: details,
        applicationUserName: accountId,
      ),
    );
  }

  @override
  Future<void> restore({required String accountId}) =>
      _iap.restorePurchases(applicationUserName: accountId);

  /// Offre Play sans `offerId` = forfait de base (prix normal, sans promotion).
  static bool _isBasePlan(ProductDetails p) {
    if (p is! GooglePlayProductDetails) return true;
    final index = p.subscriptionIndex;
    final offers = p.productDetails.subscriptionOfferDetails;
    return index == null || offers == null || offers[index].offerId == null;
  }

  @override
  Future<List<StorePurchase>> unfinished() async {
    if (appStore) {
      // Transaction StoreKit 2 vérifiée par l'OS : clôture par `finish`.
      final transactions = await SK2Transaction.unfinishedTransactions();
      return [
        for (final t in transactions)
          StorePurchase(
            productId: t.productId,
            status: StorePurchaseStatus.purchased,
            proof: AppStoreProof(t.id),
            handle: t,
          ),
      ];
    }
    final android = _iap
        .getPlatformAddition<InAppPurchaseAndroidPlatformAddition>();
    final res = await android.queryPastPurchases();
    return [
      for (final d in res.pastPurchases)
        if (!d.billingClientPurchase.isAcknowledged)
          toStorePurchase(d, appStore: false),
    ];
  }

  @override
  Future<void> complete(StorePurchase purchase) async {
    switch (purchase.handle) {
      case final PurchaseDetails d when d.pendingCompletePurchase:
        await _iap.completePurchase(d);
      case final SK2Transaction t:
        await SK2Transaction.finish(int.parse(t.id));
    }
  }

  @override
  Uri get manageSubscriptionsUri => appStore
      ? Uri.parse('https://apps.apple.com/account/subscriptions')
      : Uri.https('play.google.com', '/store/account/subscriptions', {
          'package': _packageName,
        });
}
