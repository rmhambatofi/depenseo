/// Produits Premium, mêmes identifiants dans les deux stores (ADR-040).
const premiumProductIds = {'premium_monthly', 'premium_yearly'};

/// Preuve d'achat présentée à `POST /subscriptions/verify` (ADR-040).
sealed class PurchaseProof {
  const PurchaseProof();

  Map<String, dynamic> toJson();
}

/// StoreKit 2 : identifiant de la transaction.
class AppStoreProof extends PurchaseProof {
  const AppStoreProof(this.transactionId);

  final String transactionId;

  @override
  Map<String, dynamic> toJson() => {
    'store': 'app_store',
    'transactionId': transactionId,
  };
}

/// Play Billing : jeton d'achat.
class GooglePlayProof extends PurchaseProof {
  const GooglePlayProof(this.purchaseToken);

  final String purchaseToken;

  @override
  Map<String, dynamic> toJson() => {
    'store': 'google_play',
    'purchaseToken': purchaseToken,
  };
}

enum StorePurchaseStatus { pending, purchased, restored, canceled, error }

/// Un achat remonté par le store. [handle] : objet du plugin, rendu à
/// [StoreGateway.complete].
class StorePurchase {
  const StorePurchase({
    required this.productId,
    required this.status,
    this.proof,
    this.handle,
  });

  final String productId;
  final StorePurchaseStatus status;
  final PurchaseProof? proof;
  final Object? handle;
}

class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.title,
    required this.price,
  });

  final String id;
  final String title;

  /// Prix localisé fourni par le store (jamais recalculé par l'app).
  final String price;
}

/// Accès au store de la plateforme (in_app_purchase), remplacé par un faux
/// store dans les tests.
abstract interface class StoreGateway {
  /// Achats nouveaux, restaurés ou interrompus ; à écouter dès le démarrage.
  Stream<List<StorePurchase>> get purchases;

  /// Produits Premium disponibles ; vide si le store est indisponible.
  Future<List<StoreProduct>> products();

  /// Lance l'achat ; le résultat arrive par [purchases]. [accountId] = compte
  /// Depenseo transmis au store (`appAccountToken`, `obfuscatedAccountId`).
  Future<bool> buy(String productId, {required String accountId});

  /// Redélivre les achats du compte store par [purchases].
  Future<void> restore({required String accountId});

  /// Transactions non closes (achat non vérifié faute de réseau, paiement
  /// différé validé app fermée) : relues à l'ouverture de session et au retour
  /// au premier plan. Play rembourse un achat non acquitté sous 3 jours.
  Future<List<StorePurchase>> unfinished();

  /// Clôt la transaction (accusé de réception Play, `finish` StoreKit).
  Future<void> complete(StorePurchase purchase);

  /// Gestion et résiliation de l'abonnement dans le store (§5) ; `null` sans store.
  Uri? get manageSubscriptionsUri;
}

/// Plateforme sans store (bureau, web) : rien à acheter.
class UnavailableStoreGateway implements StoreGateway {
  const UnavailableStoreGateway();

  @override
  Stream<List<StorePurchase>> get purchases => const Stream.empty();

  @override
  Future<List<StoreProduct>> products() async => const [];

  @override
  Future<bool> buy(String productId, {required String accountId}) async =>
      false;

  @override
  Future<void> restore({required String accountId}) async {}

  @override
  Future<List<StorePurchase>> unfinished() async => const [];

  @override
  Future<void> complete(StorePurchase purchase) async {}

  @override
  Uri? get manageSubscriptionsUri => null;
}

/// Une entrée par produit : Play renvoie une entrée par offre d'un abonnement ;
/// on garde le forfait de base ([isBasePlan]), à défaut la première offre.
List<T> onePerProduct<T>(
  List<T> products,
  String Function(T) id,
  bool Function(T) isBasePlan,
) {
  final kept = <String, T>{};
  for (final p in products) {
    final current = kept[id(p)];
    if (current == null || (!isBasePlan(current) && isBasePlan(p))) {
      kept[id(p)] = p;
    }
  }
  return kept.values.toList();
}
