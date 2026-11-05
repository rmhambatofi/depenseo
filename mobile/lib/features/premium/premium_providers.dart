import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/premium/in_app_purchase_gateway.dart';
import '../../core/premium/store_gateway.dart';
import '../../core/premium/subscription_api.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';
import '../expenses/expense_providers.dart';

final storeGatewayProvider = Provider<StoreGateway>(
  (ref) => platformStoreGateway(),
);

final subscriptionApiProvider = Provider<SubscriptionApi>(
  (ref) => SubscriptionApi(ref.watch(apiClientProvider)),
);

/// Ouvre un lien hors de l'app (gestion de l'abonnement dans le store).
final urlOpenerProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Produits Premium du store (prix localisés).
final storeProductsProvider = FutureProvider.autoDispose<List<StoreProduct>>(
  retry: (_, _) => null,
  (ref) async {
    final products = await ref.watch(storeGatewayProvider).products();
    return [...products]..sort((a, b) => a.id.compareTo(b.id));
  },
);

/// Droits du compte lus sur l'API (`GET /subscriptions`) à l'ouverture de
/// session et au retour au premier plan : l'app n'en déduit rien (ADR-040).
final subscriptionStatusProvider =
    AsyncNotifierProvider<SubscriptionStatusController, SubscriptionStatus>(
      SubscriptionStatusController.new,
      retry: (_, _) => null,
    );

class SubscriptionStatusController extends AsyncNotifier<SubscriptionStatus> {
  @override
  Future<SubscriptionStatus> build() async {
    // Relu à chaque changement de compte.
    await ref.watch(accountContextProvider.future);
    return ref.read(subscriptionApiProvider).status();
  }

  /// Essai de 14 jours (une fois par compte) ; 409 → état relu puis relancé.
  Future<void> startTrial() async {
    try {
      final status = await ref.read(subscriptionApiProvider).startTrial();
      if (ref.mounted) state = AsyncData(status);
    } on SubscriptionApiException catch (e) {
      if (e.status == 409 && ref.mounted) ref.invalidateSelf();
      rethrow;
    }
  }
}

/// Issue d'un achat remonté par le store, affichée par l'écran Abonnement.
enum PurchaseOutcome {
  activated,
  restored,
  pending,
  invalid,
  otherAccount,
  retryLater,
  failed,
}

/// Présente chaque achat à l'API puis clôt la transaction. Un achat dont la
/// vérification n'a pas abouti (hors ligne, 503) reste ouvert : le store le
/// redélivre. Hors session, rien n'est présenté ni clos.
class PurchaseHandler {
  PurchaseHandler(this._ref);

  final Ref _ref;
  final _outcomes = StreamController<PurchaseOutcome>.broadcast();
  Future<void> _chain = Future.value();

  /// Achats déjà clos pendant cette exécution : un même achat livré par le
  /// flux puis par la reprise (retour de la feuille d'achat) n'est pas
  /// présenté deux fois.
  final Set<String> _closed = {};

  Stream<PurchaseOutcome> get outcomes => _outcomes.stream;

  /// Traitements en série, dans l'ordre d'arrivée.
  Future<void> handle(List<StorePurchase> purchases) =>
      _chain = _chain.then((_) async {
        for (final p in purchases) {
          try {
            await _one(p);
          } on Object {
            // Store ou réseau en échec : l'achat non clos sera redélivré.
            _emit(PurchaseOutcome.retryLater);
          }
        }
      });

  /// Reprend les transactions restées ouvertes (vérification échouée,
  /// paiement différé validé app fermée).
  Future<void> resume() async {
    final List<StorePurchase> open;
    try {
      open = await _ref.read(storeGatewayProvider).unfinished();
    } on Object {
      return;
    }
    if (open.isNotEmpty) await handle(open);
  }

  void _emit(PurchaseOutcome o) {
    if (!_outcomes.isClosed) _outcomes.add(o);
  }

  Future<void> _one(StorePurchase p) async {
    final store = _ref.read(storeGatewayProvider);
    switch (p.status) {
      case StorePurchaseStatus.pending:
        return _emit(PurchaseOutcome.pending);
      case StorePurchaseStatus.canceled:
        return store.complete(p);
      case StorePurchaseStatus.error:
        await store.complete(p);
        return _emit(PurchaseOutcome.failed);
      case StorePurchaseStatus.purchased || StorePurchaseStatus.restored:
        break;
    }
    final AuthStatus auth;
    try {
      auth = await _ref.read(authControllerProvider.future);
    } on Object {
      return;
    }
    if (auth != AuthStatus.signedIn || !_ref.mounted) return;
    final proof = p.proof;
    if (proof == null) {
      await store.complete(p);
      return _emit(PurchaseOutcome.invalid);
    }
    final key = jsonEncode(proof.toJson());
    if (p.status == StorePurchaseStatus.purchased && _closed.contains(key)) {
      return store.complete(p);
    }
    Future<void> close() async {
      await store.complete(p);
      _closed.add(key);
    }

    try {
      await _ref.read(subscriptionApiProvider).verify(proof);
    } on SubscriptionApiException catch (e) {
      switch (e.status) {
        case 400:
          await close();
          _emit(PurchaseOutcome.invalid);
        case 409:
          await close();
          _emit(PurchaseOutcome.otherAccount);
        default:
          _emit(PurchaseOutcome.retryLater);
      }
      return;
    }
    await close();
    if (_ref.mounted) _ref.invalidate(subscriptionStatusProvider);
    _emit(
      p.status == StorePurchaseStatus.restored
          ? PurchaseOutcome.restored
          : PurchaseOutcome.activated,
    );
  }

  void dispose() => _outcomes.close();
}

final purchaseHandlerProvider = Provider<PurchaseHandler>((ref) {
  final handler = PurchaseHandler(ref);
  ref.onDispose(handler.dispose);
  return handler;
});

/// Écouté par l'app dès le démarrage : achats livrés par le store, puis
/// transactions non closes reprises à l'ouverture de session et à chaque
/// retour au premier plan (où les droits sont aussi relus : fin d'essai ou
/// d'abonnement en cours de session).
final purchaseListenerProvider = Provider<void>((ref) {
  final handler = ref.watch(purchaseHandlerProvider);
  final sub = ref
      .watch(storeGatewayProvider)
      .purchases
      .listen(handler.handle, onError: (Object _) {});
  ref.onDispose(sub.cancel);
  bool signedIn() =>
      ref.read(authControllerProvider).value == AuthStatus.signedIn;
  ref.listen(authControllerProvider, (previous, next) {
    if (next.value == AuthStatus.signedIn &&
        previous?.value != AuthStatus.signedIn) {
      handler.resume();
    }
  }, fireImmediately: true);
  final lifecycle = AppLifecycleListener(
    onResume: () {
      if (!signedIn()) return;
      ref.invalidate(subscriptionStatusProvider);
      handler.resume();
    },
  );
  ref.onDispose(lifecycle.dispose);
});
