import 'package:depenseo/features/auth/password_reset_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/test_app.dart';

void main() {
  group('inscription (F-AUTH-01)', () {
    testWidgets('CGU cochées : compte demandé dans la langue de l’app', (
      tester,
    ) async {
      final app = TestApp();
      app.api.on('POST /auth/register', (_) => const FakeResponse(202));
      await app.pump(tester, locale: const Locale('en'));
      await revealLink(tester, find.text('Create an account'));
      await tap(tester, find.text('Create an account'));

      await enter(tester, 'email', 'ana@example.org');
      await enter(tester, 'password', '12345678');
      await tap(tester, find.byKey(const Key('acceptTerms')));
      await tap(tester, find.widgetWithText(FilledButton, 'Create my account'));

      expect(app.api.calls('POST /auth/register').single.body, {
        'email': 'ana@example.org',
        'password': '12345678',
        'acceptTerms': true,
        'language': 'en',
      });
      expect(app.location, '/register/sent');
      expect(await app.tokens.read(), isNull);
    });

    testWidgets('sans consentement ou mot de passe trop court : aucun appel', (
      tester,
    ) async {
      final app = TestApp();
      await app.pump(tester);
      await revealLink(tester, find.text('Créer un compte'));
      await tap(tester, find.text('Créer un compte'));

      await enter(tester, 'email', 'ana@example.org');
      await enter(tester, 'password', '1234567');
      await tap(tester, find.widgetWithText(FilledButton, 'Créer mon compte'));

      expect(find.text('8 caractères minimum.'), findsOneWidget);
      expect(
        find.text('Acceptez les conditions pour continuer.'),
        findsOneWidget,
      );
      expect(app.api.requests, isEmpty);
    });
  });

  group('vérification de l’adresse (lien e-mail)', () {
    testWidgets('lien valide : jeton du fragment consommé', (tester) async {
      final app = TestApp();
      app.api.on('POST /auth/verify-email', (_) => const FakeResponse(204));
      await app.pump(tester);

      app.router.go('/verify-email#token=abc_DEF-123');
      await tester.pumpAndSettle();

      expect(app.api.calls('POST /auth/verify-email').single.body, {
        'token': 'abc_DEF-123',
      });
      expect(
        find.text('Adresse vérifiée. Vous pouvez vous connecter.'),
        findsOneWidget,
      );
    });

    testWidgets('lien expiré (400) : message, invitation à recommencer', (
      tester,
    ) async {
      final app = TestApp();
      app.api.on(
        'POST /auth/verify-email',
        (_) => FakeResponse.problem(400, 'Bad Request'),
      );
      await app.pump(tester);

      app.router.go('/verify-email#token=old');
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Ce lien est invalide, expiré ou déjà utilisé.'),
        findsOneWidget,
      );
    });
  });

  group('réinitialisation du mot de passe (F-AUTH-03)', () {
    testWidgets('demande : même message quelle que soit l’adresse', (
      tester,
    ) async {
      final app = TestApp();
      app.api.on(
        'POST /auth/password-reset/request',
        (_) => const FakeResponse(202),
      );
      await app.pump(tester);
      await tap(tester, find.text('Mot de passe oublié ?'));

      await enter(tester, 'email', 'ana@example.org');
      await tap(tester, find.widgetWithText(FilledButton, 'Recevoir un lien'));

      expect(app.api.calls('POST /auth/password-reset/request').single.body, {
        'email': 'ana@example.org',
      });
      expect(find.textContaining('valable 30 minutes'), findsOneWidget);
    });

    testWidgets('lien : nouveau mot de passe enregistré, retour connexion', (
      tester,
    ) async {
      final app = TestApp();
      app.api.on(
        'POST /auth/password-reset/confirm',
        (_) => const FakeResponse(204),
      );
      await app.pump(tester);

      app.router.go('/reset-password#token=tok123');
      await tester.pumpAndSettle();
      await enter(tester, 'password', 'nouveau mot');
      await tap(tester, find.widgetWithText(FilledButton, 'Enregistrer'));

      expect(app.api.calls('POST /auth/password-reset/confirm').single.body, {
        'token': 'tok123',
        'password': 'nouveau mot',
      });
      expect(find.textContaining('Mot de passe modifié.'), findsOneWidget);

      await tap(tester, find.text('Aller à la connexion'));
      expect(app.location, '/login');
    });

    testWidgets('lien déjà utilisé (400) : message lien invalide', (
      tester,
    ) async {
      final app = TestApp();
      app.api.on(
        'POST /auth/password-reset/confirm',
        (_) => FakeResponse.problem(400, 'Bad Request'),
      );
      await app.pump(tester);

      app.router.go('/reset-password#token=used');
      await tester.pumpAndSettle();
      await enter(tester, 'password', 'nouveau mot');
      await tap(tester, find.widgetWithText(FilledButton, 'Enregistrer'));

      expect(
        find.textContaining('Ce lien est invalide, expiré ou déjà utilisé.'),
        findsOneWidget,
      );
    });

    testWidgets('lien ouvert avec une session active : écran accessible', (
      tester,
    ) async {
      final app = TestApp();
      await app.signIn();
      await app.pump(tester);

      app.router.go('/reset-password#token=tok');
      await tester.pumpAndSettle();

      expect(app.location, startsWith('/reset-password'));
    });
  });

  test('linkToken : fragment, repli sur la requête, absent', () {
    expect(linkToken(Uri.parse('https://x/reset-password#token=a%2Bb')), 'a+b');
    expect(linkToken(Uri.parse('/verify-email?token=q')), 'q');
    expect(linkToken(Uri.parse('/verify-email#token=')), isNull);
    expect(linkToken(Uri.parse('/verify-email')), isNull);
  });
}
