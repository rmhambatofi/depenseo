import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Requête reçue par le faux serveur : méthode, chemin sous `/api/v1`, en-têtes, corps JSON.
class FakeRequest {
  FakeRequest(
    this.method,
    this.path,
    this.headers,
    this.body, [
    this.query = const {},
  ]);

  final String method;
  final String path;
  final Map<String, String> query;
  final Map<String, dynamic> headers;
  final Object? body;

  String get key => '$method $path';
  String? get authorization => headers['Authorization'] as String?;
}

class FakeResponse {
  const FakeResponse(this.status, [this.body]);

  final int status;
  final Object? body;

  static FakeResponse problem(int status, String title) => FakeResponse(
    status,
    {'type': 'about:blank', 'title': title, 'status': status},
  );
}

typedef FakeHandler = FutureOr<FakeResponse> Function(FakeRequest request);

/// Faux client API : adaptateur Dio qui répond par route (`'POST /auth/login'`).
/// Route inconnue → 404. Un gestionnaire qui lève simule une panne réseau.
class FakeApi implements HttpClientAdapter {
  final Map<String, FakeHandler> routes = {};
  final List<FakeRequest> requests = [];

  void on(String key, FakeHandler handler) => routes[key] = handler;

  Iterable<FakeRequest> calls(String key) =>
      requests.where((r) => r.key == key);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final path = options.uri.path.replaceFirst('/api/v1', '');
    final request = FakeRequest(
      options.method,
      path,
      Map.of(options.headers),
      options.data is String
          ? jsonDecode(options.data as String)
          : options.data,
      options.uri.queryParameters,
    );
    requests.add(request);
    final handler = routes[request.key];
    if (handler == null) {
      return _json(FakeResponse.problem(404, 'Not Found'));
    }
    return _json(await handler(request));
  }

  ResponseBody _json(FakeResponse response) {
    if (response.body == null) {
      return ResponseBody.fromString('', response.status);
    }
    return ResponseBody.fromString(
      jsonEncode(response.body),
      response.status,
      headers: {
        Headers.contentTypeHeader: [
          response.status >= 400
              ? 'application/problem+json'
              : Headers.jsonContentType,
        ],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Corps de réponse de `/auth/login`, `/auth/refresh`, `/auth/social` (ADR-018).
Map<String, Object> tokenBody(String access, String refresh) => {
  'tokenType': 'Bearer',
  'accessToken': access,
  'expiresIn': 900,
  'refreshToken': refresh,
  'refreshExpiresIn': 2592000,
};
