import 'package:dio/dio.dart';

import 'token_store.dart';

/// Motifs d'échec présentés à l'utilisateur ; aucun détail serveur n'est affiché tel quel.
enum AuthFailure {
  /// 401 sur la connexion (adresse inconnue ou mauvais mot de passe, ADR-017).
  invalidCredentials,

  /// 403 sur la connexion : adresse non vérifiée ; 403 social : adresse non attestée.
  emailNotVerified,

  /// 400 sur un lien de vérification ou de réinitialisation : invalide, expiré ou utilisé.
  invalidLink,

  /// 400 sur un formulaire (refus de validation côté serveur).
  invalidInput,

  /// 401 social : jeton d'identité refusé.
  identityRejected,

  /// 409 social : adresse d'un compte existant non rattachable (ADR-020).
  accountNotLinkable,

  /// 422 social : création de compte, CGU à accepter puis rejouer.
  termsRequired,

  /// 503 social : fournisseur désactivé côté serveur.
  providerUnavailable,

  /// Pas de réponse (hors ligne, délai dépassé).
  network,

  unknown,
}

class AuthException implements Exception {
  const AuthException(this.failure);

  final AuthFailure failure;

  @override
  String toString() => 'AuthException($failure)';
}

enum SocialProvider { apple, google }

/// Routes publiques d'authentification de l'API (ADR-017 à ADR-020).
class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  /// 202 dans tous les cas pour une adresse valide (pas d'énumération des comptes).
  Future<void> register({
    required String email,
    required String password,
    required String language,
  }) => _call(
    () => _dio.post<void>(
      '/auth/register',
      data: {
        'email': email,
        'password': password,
        'acceptTerms': true,
        'language': language,
      },
    ),
    {400: AuthFailure.invalidInput},
  );

  Future<void> verifyEmail(String token) => _call(
    () => _dio.post<void>('/auth/verify-email', data: {'token': token}),
    {400: AuthFailure.invalidLink},
  );

  Future<SessionTokens> login(String email, String password) => _tokens(
    () => _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email, 'password': password},
    ),
    {
      400: AuthFailure.invalidCredentials,
      401: AuthFailure.invalidCredentials,
      403: AuthFailure.emailNotVerified,
    },
  );

  Future<SessionTokens> social({
    required SocialProvider provider,
    required String idToken,
    required String nonce,
    required String language,
    bool acceptTerms = false,
  }) => _tokens(
    () => _dio.post<Map<String, dynamic>>(
      '/auth/social',
      data: {
        'provider': provider.name,
        'idToken': idToken,
        'nonce': nonce,
        'language': language,
        if (acceptTerms) 'acceptTerms': true,
      },
    ),
    {
      401: AuthFailure.identityRejected,
      403: AuthFailure.emailNotVerified,
      409: AuthFailure.accountNotLinkable,
      422: AuthFailure.termsRequired,
      503: AuthFailure.providerUnavailable,
    },
  );

  Future<void> requestPasswordReset(String email) => _call(
    () =>
        _dio.post<void>('/auth/password-reset/request', data: {'email': email}),
    {400: AuthFailure.invalidInput},
  );

  Future<void> confirmPasswordReset(String token, String password) => _call(
    () => _dio.post<void>(
      '/auth/password-reset/confirm',
      data: {'token': token, 'password': password},
    ),
    {400: AuthFailure.invalidLink},
  );

  /// Révoque la famille de ce jeton côté serveur (204 toujours).
  Future<void> logout(String refreshToken) => _call(
    () => _dio.post<void>('/auth/logout', data: {'refreshToken': refreshToken}),
    const {},
  );

  Future<SessionTokens> _tokens(
    Future<Response<Map<String, dynamic>>> Function() send,
    Map<int, AuthFailure> failures,
  ) async {
    final response = await _call(send, failures);
    try {
      return SessionTokens.fromJson(response.data ?? const {});
    } on FormatException {
      throw const AuthException(AuthFailure.unknown);
    }
  }

  Future<T> _call<T>(
    Future<T> Function() send,
    Map<int, AuthFailure> failures,
  ) async {
    try {
      return await send();
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == null) throw const AuthException(AuthFailure.network);
      throw AuthException(failures[status] ?? AuthFailure.unknown);
    }
  }
}
