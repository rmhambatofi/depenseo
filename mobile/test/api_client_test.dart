import 'dart:convert';
import 'dart:typed_data';

import 'package:depenseo/core/api/api_client.dart';
import 'package:depenseo/core/auth/token_store.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/memory_secure_store.dart';

class RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({'status': 'ok'}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late TokenStore tokens;
  late RecordingAdapter adapter;
  late Dio dio;

  setUp(() {
    tokens = TokenStore(MemorySecureStore());
    adapter = RecordingAdapter();
    dio = createApiClient(baseUrl: 'https://depenseo.example/', tokens: tokens)
      ..httpClientAdapter = adapter;
  });

  test('cible /api/v1 sous l’origine configurée', () async {
    final response = await dio.get<Map<String, dynamic>>('/health');

    expect(response.data, {'status': 'ok'});
    expect(
      adapter.requests.single.uri.toString(),
      'https://depenseo.example/api/v1/health',
    );
  });

  test('requête anonyme sans session', () async {
    await dio.get<void>('/health');

    expect(adapter.requests.single.headers['Authorization'], isNull);
  });

  test('joint le jeton d’accès courant, relu à chaque requête', () async {
    await tokens.save(
      const SessionTokens(accessToken: 'a1', refreshToken: 'r1'),
    );
    await dio.get<void>('/me');
    await tokens.save(
      const SessionTokens(accessToken: 'a2', refreshToken: 'r2'),
    );
    await dio.get<void>('/me');

    expect(adapter.requests.map((r) => r.headers['Authorization']), [
      'Bearer a1',
      'Bearer a2',
    ]);
  });
}
