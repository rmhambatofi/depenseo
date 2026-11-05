import 'package:dio/dio.dart';

import '../auth/token_store.dart';

/// Client HTTP de l'API Depenseo : préfixe `/api/v1`, jeton Bearer relu à chaque requête,
/// rafraîchissement automatique sur 401, sérialisé (ADR-018 : un refresh est à usage unique,
/// deux échanges simultanés du même jeton révoqueraient la session).
///
/// [onSessionExpired] est appelé quand l'API refuse le jeton de rafraîchissement : la session
/// locale est alors déjà effacée. [adapter] remplace le transport (tests).
Dio createApiClient({
  required String baseUrl,
  required TokenStore tokens,
  void Function()? onSessionExpired,
  HttpClientAdapter? adapter,
}) {
  final origin = baseUrl.replaceAll(RegExp(r'/+$'), '');
  final options = BaseOptions(
    baseUrl: '$origin/api/v1',
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    contentType: Headers.jsonContentType,
    responseType: ResponseType.json,
  );
  final dio = Dio(options);
  if (adapter != null) dio.httpClientAdapter = adapter;
  // Client nu pour l'échange du refresh et le rejeu : jamais d'intercepteur récursif.
  // Même transport : `dio.close()` le libère aussi.
  final bare = Dio(options)..httpClientAdapter = dio.httpClientAdapter;
  dio.interceptors.add(
    _SessionInterceptor(tokens, bare, onSessionExpired ?? () {}),
  );
  return dio;
}

/// Routes d'authentification : publiques, jamais de jeton joint ni de refresh sur 401.
bool _isAuthRoute(RequestOptions options) => options.path.startsWith('/auth/');

const _sentTokenKey = 'depenseo.sentAccessToken';
const _retriedKey = 'depenseo.retried';

class _SessionInterceptor extends Interceptor {
  _SessionInterceptor(this._tokens, this._bare, this._onSessionExpired);

  final TokenStore _tokens;
  final Dio _bare;
  final void Function() _onSessionExpired;

  /// Refresh en cours, partagé par toutes les requêtes qui reçoivent un 401 pendant ce temps.
  Future<SessionTokens?>? _refreshing;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isAuthRoute(options)) {
      final session = await _tokens.read();
      if (session != null) {
        options.headers['Authorization'] = 'Bearer ${session.accessToken}';
        options.extra[_sentTokenKey] = session.accessToken;
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    final sent = request.extra[_sentTokenKey] as String?;
    if (err.response?.statusCode != 401 ||
        sent == null ||
        request.extra[_retriedKey] == true) {
      return handler.next(err);
    }
    final SessionTokens? fresh;
    try {
      fresh = await _freshTokens(sent);
    } on Object {
      // Panne réseau pendant le refresh : la session reste, l'erreur d'origine remonte.
      return handler.next(err);
    }
    if (fresh == null) return handler.next(err);
    request
      ..headers['Authorization'] = 'Bearer ${fresh.accessToken}'
      ..extra[_sentTokenKey] = fresh.accessToken
      ..extra[_retriedKey] = true;
    try {
      handler.resolve(await _bare.fetch<dynamic>(request));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  /// Jetons à utiliser après un 401 obtenu avec [sent] ; `null` si la session est perdue.
  /// Affecté sans `await` préalable : deux 401 simultanés partagent le même échange.
  Future<SessionTokens?> _freshTokens(String sent) =>
      _refreshing ??= _rotate(sent).whenComplete(() => _refreshing = null);

  Future<SessionTokens?> _rotate(String sent) async {
    final generation = _tokens.generation;
    final current = await _tokens.read();
    if (current == null) return null;
    // Une autre requête a déjà fait tourner la session pendant que celle-ci était en vol.
    if (current.accessToken != sent) return current;
    return _refresh(generation, current.refreshToken);
  }

  /// Échange le refresh de la génération [generation]. Si la session a changé entre-temps
  /// (déconnexion, nouvelle connexion), le résultat n'est ni enregistré ni effacé.
  Future<SessionTokens?> _refresh(int generation, String refreshToken) async {
    try {
      final response = await _bare.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final tokens = SessionTokens.fromJson(response.data!);
      return await _tokens.saveIfCurrent(generation, tokens) ? tokens : null;
    } on DioException catch (e) {
      // 400 (jeton mal formé) ou 401 (inconnu, expiré, réutilisé) : session perdue.
      // Autre statut ou pas de réponse : session conservée. Limite : si la réponse
      // d'une rotation réussie est perdue, le refresh gardé est déjà consommé et le
      // prochain échange révoquera la famille (ADR-018, ADR-047).
      final status = e.response?.statusCode;
      if (status != 400 && status != 401) rethrow;
      if (await _tokens.clearIfCurrent(generation)) _onSessionExpired();
      return null;
    }
  }
}
