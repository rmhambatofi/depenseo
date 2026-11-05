import 'dart:async';
import 'dart:io';

import 'package:depenseo/core/api/api_client.dart';
import 'package:depenseo/core/auth/token_store.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_api.dart';
import 'support/memory_secure_store.dart';

void main() {
  late TokenStore tokens;
  late FakeApi api;
  late Dio dio;
  late int expired;

  /// `/me` répond 200 au jeton `valid`, 401 sinon.
  void meAcceptsOnly(String valid) => api.on(
    'GET /me',
    (r) => r.authorization == 'Bearer $valid'
        ? const FakeResponse(200, {'id': 'u1'})
        : FakeResponse.problem(401, 'Unauthorized'),
  );

  setUp(() async {
    tokens = TokenStore(MemorySecureStore());
    api = FakeApi();
    expired = 0;
    dio = createApiClient(
      baseUrl: 'https://depenseo.example',
      tokens: tokens,
      adapter: api,
      onSessionExpired: () => expired++,
    );
    await tokens.save(
      const SessionTokens(accessToken: 'old', refreshToken: 'r1'),
    );
  });

  test(
    '401 : rafraîchit, enregistre la rotation et rejoue la requête',
    () async {
      meAcceptsOnly('new');
      api.on(
        'POST /auth/refresh',
        (_) => FakeResponse(200, tokenBody('new', 'r2')),
      );

      final response = await dio.get<Map<String, dynamic>>('/me');

      expect(response.data, {'id': 'u1'});
      expect(api.calls('POST /auth/refresh').single.body, {
        'refreshToken': 'r1',
      });
      expect(
        await tokens.read(),
        const SessionTokens(accessToken: 'new', refreshToken: 'r2'),
      );
      expect(api.calls('GET /me').map((r) => r.authorization), [
        'Bearer old',
        'Bearer new',
      ]);
      expect(expired, 0);
    },
  );

  test(
    '401 simultanés : un seul refresh, toutes les requêtes rejouées (ADR-018)',
    () async {
      meAcceptsOnly('new');
      final release = Completer<void>();
      api.on('POST /auth/refresh', (_) async {
        await release.future;
        return FakeResponse(200, tokenBody('new', 'r2'));
      });

      final calls = [for (var i = 0; i < 5; i++) dio.get<void>('/me')];
      await pumpEventQueue();
      release.complete();
      final responses = await Future.wait(calls);

      expect(responses.map((r) => r.statusCode), everyElement(200));
      expect(api.calls('POST /auth/refresh'), hasLength(1));
    },
  );

  test('401 après un refresh déjà fait par une autre requête : rejoue sans rafraîchir', () async {
    meAcceptsOnly('new');
    api.on('GET /slow', (r) async {
      // Pendant que cette requête est en vol avec « old », la session tourne.
      await tokens.save(
        const SessionTokens(accessToken: 'new', refreshToken: 'r2'),
      );
      return FakeResponse.problem(401, 'Unauthorized');
    });
    api.on('POST /auth/refresh', (_) => FakeResponse(200, tokenBody('x', 'y')));

    await expectLater(dio.get<void>('/slow'), throwsA(isA<DioException>()));

    expect(api.calls('POST /auth/refresh'), isEmpty);
    expect(api.calls('GET /slow'), hasLength(2));
  });

  test('refresh refusé : session effacée et signalée, 401 remonté', () async {
    meAcceptsOnly('new');
    api.on(
      'POST /auth/refresh',
      (_) => FakeResponse.problem(401, 'Unauthorized'),
    );

    final error = await dio
        .get<void>('/me')
        .then<Object?>((_) => null, onError: (Object e) => e);

    expect((error! as DioException).response?.statusCode, 401);
    expect(await tokens.read(), isNull);
    expect(expired, 1);
  });

  test('refresh en panne réseau : session conservée, rien signalé', () async {
    meAcceptsOnly('new');
    api.on('POST /auth/refresh', (_) => throw const SocketException('offline'));

    await expectLater(dio.get<void>('/me'), throwsA(isA<DioException>()));

    expect(await tokens.read(), isNotNull);
    expect(expired, 0);
  });

  test('un seul rejeu : un second 401 ne relance pas de refresh', () async {
    api.on('GET /me', (_) => FakeResponse.problem(401, 'Unauthorized'));
    api.on(
      'POST /auth/refresh',
      (_) => FakeResponse(200, tokenBody('new', 'r2')),
    );

    await expectLater(dio.get<void>('/me'), throwsA(isA<DioException>()));

    expect(api.calls('POST /auth/refresh'), hasLength(1));
    expect(api.calls('GET /me'), hasLength(2));
  });

  test('routes /auth/ : ni jeton joint ni refresh sur 401', () async {
    api.on(
      'POST /auth/login',
      (_) => FakeResponse.problem(401, 'Unauthorized'),
    );

    await expectLater(
      dio.post<void>('/auth/login', data: {'email': 'a@b.c', 'password': 'x'}),
      throwsA(isA<DioException>()),
    );

    expect(api.calls('POST /auth/login').single.authorization, isNull);
    expect(api.calls('POST /auth/refresh'), isEmpty);
    expect(await tokens.read(), isNotNull);
  });

  test('sans session : 401 remonté sans refresh', () async {
    await tokens.clear();
    meAcceptsOnly('new');

    await expectLater(dio.get<void>('/me'), throwsA(isA<DioException>()));

    expect(api.calls('POST /auth/refresh'), isEmpty);
    expect(expired, 0);
  });

  test('refresh en 5xx : session conservée, rien signalé', () async {
    meAcceptsOnly('new');
    api.on(
      'POST /auth/refresh',
      (_) => FakeResponse.problem(503, 'Unavailable'),
    );

    await expectLater(dio.get<void>('/me'), throwsA(isA<DioException>()));

    expect(await tokens.read(), isNotNull);
    expect(expired, 0);
  });

  test(
    'refresh en 400 (jeton illisible) : traité comme une session perdue',
    () async {
      meAcceptsOnly('new');
      api.on(
        'POST /auth/refresh',
        (_) => FakeResponse.problem(400, 'Bad Request'),
      );

      await expectLater(dio.get<void>('/me'), throwsA(isA<DioException>()));

      expect(await tokens.read(), isNull);
      expect(expired, 1);
    },
  );

  test(
    'refresh refusé pour 5 requêtes simultanées : expiration signalée une fois',
    () async {
      meAcceptsOnly('new');
      api.on(
        'POST /auth/refresh',
        (_) => FakeResponse.problem(401, 'Unauthorized'),
      );

      final calls = [
        for (var i = 0; i < 5; i++)
          dio
              .get<void>('/me')
              .then<Object?>((_) => null, onError: (Object e) => e),
      ];
      await Future.wait(calls);

      expect(api.calls('POST /auth/refresh'), hasLength(1));
      expect(expired, 1);
    },
  );

  test(
    'déconnexion pendant un refresh : la rotation n’écrit pas le coffre vidé',
    () async {
      meAcceptsOnly('new');
      final release = Completer<void>();
      api.on('POST /auth/refresh', (_) async {
        await release.future;
        return FakeResponse(200, tokenBody('new', 'r2'));
      });

      final call = dio
          .get<void>('/me')
          .then<Object?>((_) => null, onError: (Object e) => e);
      await pumpEventQueue();
      await tokens.clear();
      release.complete();

      expect(await call, isA<DioException>());
      expect(await tokens.read(), isNull);
      expect(expired, 0);
    },
  );

  test(
    'nouvelle connexion pendant un refresh refusé : la nouvelle session survit',
    () async {
      meAcceptsOnly('new');
      final release = Completer<void>();
      api.on('POST /auth/refresh', (_) async {
        await release.future;
        return FakeResponse.problem(401, 'Unauthorized');
      });

      final call = dio
          .get<void>('/me')
          .then<Object?>((_) => null, onError: (Object e) => e);
      await pumpEventQueue();
      const other = SessionTokens(accessToken: 'b', refreshToken: 's');
      await tokens.save(other);
      release.complete();
      await call;

      expect(await tokens.read(), other);
      expect(expired, 0);
    },
  );
}
