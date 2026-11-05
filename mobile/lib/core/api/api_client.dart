import 'package:dio/dio.dart';

import '../auth/token_store.dart';

/// Client HTTP de l'API Depenseo : préfixe `/api/v1`, jeton Bearer relu à chaque requête.
/// Le rafraîchissement automatique (ADR-018 : un seul refresh à la fois) arrive en P6-02.
Dio createApiClient({required String baseUrl, required TokenStore tokens}) {
  final origin = baseUrl.replaceAll(RegExp(r'/+$'), '');
  return Dio(
    BaseOptions(
      baseUrl: '$origin/api/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
    ),
  )..interceptors.add(_BearerInterceptor(tokens));
}

class _BearerInterceptor extends Interceptor {
  _BearerInterceptor(this._tokens);

  final TokenStore _tokens;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final session = await _tokens.read();
    if (session != null) {
      options.headers['Authorization'] = 'Bearer ${session.accessToken}';
    }
    handler.next(options);
  }
}
