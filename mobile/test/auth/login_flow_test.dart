import 'package:depenseo/core/auth/token_store.dart';
import 'package:depenseo/providers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/test_app.dart';

void main() {
  testWidgets('sans session : écran de connexion', (tester) async {
    final app = TestApp();
    await app.pump(tester);

    expect(app.location, '/login');
    expect(find.text('Se connecter'), findsWidgets);
  });

  testWidgets('connexion : jetons au coffre, accueil (F-AUTH-01, NF-SEC-02)', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on(
      'POST /auth/login',
      (_) => FakeResponse(200, tokenBody('a1', 'r1')),
    );
    await app.pump(tester);

    await enter(tester, 'email', ' Ana@Example.org ');
    await enter(tester, 'password', 'correct horse');
    await tap(tester, find.widgetWithText(FilledButton, 'Se connecter'));

    expect(app.api.calls('POST /auth/login').single.body, {
      'email': 'Ana@Example.org',
      'password': 'correct horse',
    });
    expect(
      await app.tokens.read(),
      const SessionTokens(accessToken: 'a1', refreshToken: 'r1'),
    );
    expect(app.location, '/');
    expect(find.text('Mes dépenses'), findsOneWidget);
  });

  testWidgets('connexion refusée (401) : message, pas de session', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on(
      'POST /auth/login',
      (_) => FakeResponse.problem(401, 'Unauthorized'),
    );
    await app.pump(tester);

    await enter(tester, 'email', 'ana@example.org');
    await enter(tester, 'password', 'wrong pass');
    await tap(tester, find.widgetWithText(FilledButton, 'Se connecter'));

    expect(find.text('Adresse ou mot de passe incorrect.'), findsOneWidget);
    expect(await app.tokens.read(), isNull);
    expect(app.location, '/login');
  });

  testWidgets('adresse non vérifiée (403) : invite à ouvrir le lien', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on(
      'POST /auth/login',
      (_) => FakeResponse.problem(403, 'Forbidden'),
    );
    await app.pump(tester);

    await enter(tester, 'email', 'ana@example.org');
    await enter(tester, 'password', 'correct horse');
    await tap(tester, find.widgetWithText(FilledButton, 'Se connecter'));

    expect(
      find.text('Adresse non vérifiée : ouvrez le lien reçu par e-mail.'),
      findsOneWidget,
    );
  });

  testWidgets('adresse mal formée : aucun appel', (tester) async {
    final app = TestApp();
    await app.pump(tester);

    await enter(tester, 'email', 'ana');
    await enter(tester, 'password', 'x');
    await tap(tester, find.widgetWithText(FilledButton, 'Se connecter'));

    expect(find.text('Saisissez une adresse e-mail valide.'), findsOneWidget);
    expect(app.api.requests, isEmpty);
  });

  testWidgets(
    'déconnexion : révocation serveur, coffre vidé, retour connexion',
    (tester) async {
      final app = TestApp();
      app.api.on('POST /auth/logout', (_) => const FakeResponse(204));
      await app.signIn();
      await app.store.write('account.epoch', 'epoch-a');
      await app.pump(tester);

      await tap(tester, find.byTooltip('Se déconnecter'));

      expect(app.api.calls('POST /auth/logout').single.body, {
        'refreshToken': 'refresh',
      });
      expect(await app.store.read('account.epoch'), isNull);
      expect(await app.tokens.read(), isNull);
      expect(app.location, '/login');
    },
  );

  testWidgets('déconnexion hors ligne : session locale effacée quand même', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on('POST /auth/logout', (_) => throw Exception('offline'));
    await app.signIn();
    await app.pump(tester);

    await tap(tester, find.byTooltip('Se déconnecter'));

    expect(await app.tokens.read(), isNull);
    expect(app.location, '/login');
  });

  testWidgets('refresh refusé pendant l’usage : retour à la connexion', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on('GET /me', (_) => FakeResponse.problem(401, 'Unauthorized'));
    app.api.on(
      'POST /auth/refresh',
      (_) => FakeResponse.problem(401, 'Unauthorized'),
    );
    await app.signIn();
    await app.pump(tester);
    expect(app.location, '/');

    // Dans l'horloge simulée : le coffre (verrou interne) y a été créé.
    final call = app.container
        .read(apiClientProvider)
        .get<void>('/me')
        .then<Object?>((_) => null, onError: (Object e) => e);
    await tester.pumpAndSettle();

    expect(await call, isA<DioException>());
    expect(await app.tokens.read(), isNull);
    expect(app.location, '/login');
  });

  testWidgets('réinstallation : session héritée du trousseau purgée', (
    tester,
  ) async {
    final app = TestApp();
    await app.signIn();
    await app.pump(tester, freshInstall: true);

    expect(app.location, '/login');
    expect(await app.tokens.read(), isNull);
  });

  testWidgets('stockage sécurisé illisible : écran d’erreur puis réessai', (
    tester,
  ) async {
    final store = FlakySecureStore();
    final app = TestApp(store: store);
    await app.pump(tester);

    expect(app.location, '/storage-error');
    expect(find.text('Stockage sécurisé inaccessible'), findsOneWidget);

    store.failing = false;
    await tap(tester, find.text('Réessayer'));

    expect(app.location, '/login');
  });
}
