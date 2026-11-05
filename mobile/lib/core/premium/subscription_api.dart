import 'package:dio/dio.dart';

import 'store_gateway.dart';

/// Requête d'abonnement refusée ou réseau absent.
class SubscriptionApiException implements Exception {
  const SubscriptionApiException({required this.status});

  /// `null` : pas de réponse (hors ligne).
  final int? status;
}

/// Offre en cours selon le service Entitlements de l'API (ADR-040/041).
enum Plan { free, trial, premium }

/// `SubscriptionStatusDto` : droits calculés par l'API, jamais côté client.
class SubscriptionStatus {
  const SubscriptionStatus({
    required this.plan,
    required this.premiumUntil,
    required this.trialEndsAt,
    required this.trialAvailable,
  });

  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) {
    DateTime? instant(Object? v) =>
        v is String ? DateTime.parse(v).toUtc() : null;
    return SubscriptionStatus(
      plan: Plan.values.byName(json['plan'] as String),
      premiumUntil: instant(json['premiumUntil']),
      trialEndsAt: instant(json['trialEndsAt']),
      trialAvailable: json['trialAvailable'] as bool,
    );
  }

  final Plan plan;
  final DateTime? premiumUntil;
  final DateTime? trialEndsAt;
  final bool trialAvailable;

  /// Fonctions Premium utilisables (essai compris) ; sinon lecture seule (§5).
  bool get premiumActive => plan != Plan.free;
}

/// Routes `/subscriptions` (ADR-040) : état, essai de 14 jours sans passage
/// par le store, vérification d'un achat par l'API auprès du store.
class SubscriptionApi {
  SubscriptionApi(this._dio);

  final Dio _dio;

  Future<SubscriptionStatus> _call(
    Future<Response<Map<String, dynamic>>> Function() call,
  ) async {
    try {
      final res = await call();
      return SubscriptionStatus.fromJson(res.data!);
    } on DioException catch (e) {
      throw SubscriptionApiException(status: e.response?.statusCode);
    } on Object {
      // Réponse illisible (offre inconnue de cette version de l'app).
      throw const SubscriptionApiException(status: 0);
    }
  }

  Future<SubscriptionStatus> status() =>
      _call(() => _dio.get<Map<String, dynamic>>('/subscriptions'));

  /// 409 : essai déjà consommé par ce compte.
  Future<SubscriptionStatus> startTrial() =>
      _call(() => _dio.post<Map<String, dynamic>>('/subscriptions/trial'));

  /// 400 reçu invalide, 409 achat d'un autre compte, 503 store injoignable.
  Future<SubscriptionStatus> verify(PurchaseProof proof) => _call(
    () => _dio.post<Map<String, dynamic>>(
      '/subscriptions/verify',
      data: proof.toJson(),
    ),
  );
}
