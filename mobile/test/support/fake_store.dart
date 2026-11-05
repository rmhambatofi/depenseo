// Faux store (P6-13, ADR-058) : catalogue, achats lancés, restauration et
// transactions closes ; les achats sont livrés par [FakeStore.deliver].
import 'dart:async';

import 'package:depenseo/core/premium/store_gateway.dart';

class FakeStore implements StoreGateway {
  final _purchases = StreamController<List<StorePurchase>>.broadcast();

  List<StoreProduct> catalog = const [
    StoreProduct(
      id: 'premium_monthly',
      title: 'Premium mensuel',
      price: '2,49 €',
    ),
    StoreProduct(
      id: 'premium_yearly',
      title: 'Premium annuel',
      price: '19,99 €',
    ),
  ];

  /// Achats livrés par [restore] (achats du compte store).
  List<StorePurchase> restorable = const [];

  /// Transactions non closes rendues par [unfinished] (retirées une fois closes).
  List<StorePurchase> open = [];
  int unfinishedQueries = 0;
  bool buyStarts = true;
  Uri? manageUri = Uri.parse('https://apps.apple.com/account/subscriptions');

  final List<({String productId, String accountId})> buys = [];
  final List<String> restores = [];
  final List<StorePurchase> completed = [];

  void deliver(List<StorePurchase> purchases) => _purchases.add(purchases);

  @override
  Stream<List<StorePurchase>> get purchases => _purchases.stream;

  @override
  Future<List<StoreProduct>> products() async => catalog;

  @override
  Future<bool> buy(String productId, {required String accountId}) async {
    buys.add((productId: productId, accountId: accountId));
    return buyStarts;
  }

  @override
  Future<void> restore({required String accountId}) async {
    restores.add(accountId);
    if (restorable.isNotEmpty) deliver(restorable);
  }

  @override
  Future<List<StorePurchase>> unfinished() async {
    unfinishedQueries++;
    return [...open];
  }

  @override
  Future<void> complete(StorePurchase purchase) async {
    completed.add(purchase);
    open.remove(purchase);
  }

  @override
  Uri? get manageSubscriptionsUri => manageUri;
}
