import 'package:depenseo/core/auth/auth_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/test_app.dart';

void main() {
  testWidgets(
    'Apple : id_token et nonce brut transmis, session ouverte (F-AUTH-02)',
    (tester) async {
      final app = TestApp();
      app.api.on(
        'POST /auth/social',
        (_) => FakeResponse(200, tokenBody('a', 'r')),
      );
      await app.pump(tester);

      await tap(tester, find.text('Continuer avec Apple'));

      expect(app.social.calls, [SocialProvider.apple]);
      expect(app.api.calls('POST /auth/social').single.body, {
        'provider': 'apple',
        'idToken': 'id-token',
        'nonce': 'raw-nonce',
        'language': 'fr',
      });
      expect(app.location, '/');
    },
  );

  testWidgets(
    'nouveau compte Google (422) : consentement puis rejeu acceptTerms',
    (tester) async {
      final app = TestApp();
      app.api.on(
        'POST /auth/social',
        (r) => (r.body! as Map)['acceptTerms'] == true
            ? FakeResponse(200, tokenBody('a', 'r'))
            : FakeResponse.problem(422, 'Unprocessable'),
      );
      await app.pump(tester);

      await tapAndPump(tester, find.text('Continuer avec Google'));
      expect(find.text('Nouveau compte'), findsOneWidget);
      await tapAndPump(tester, find.text('Accepter et créer'));

      final calls = app.api.calls('POST /auth/social').toList();
      expect(calls, hasLength(2));
      expect((calls.last.body! as Map)['acceptTerms'], isTrue);
      expect((calls.last.body! as Map)['idToken'], 'id-token');
      expect(app.social.calls, hasLength(1), reason: 'même id_token rejoué');
      expect(app.location, '/');
    },
  );

  testWidgets('consentement refusé : pas de compte, reste sur la connexion', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on(
      'POST /auth/social',
      (_) => FakeResponse.problem(422, 'Unprocessable'),
    );
    await app.pump(tester);

    await tapAndPump(tester, find.text('Continuer avec Google'));
    await tap(tester, find.text('Annuler'));

    expect(app.api.calls('POST /auth/social'), hasLength(1));
    expect(await app.tokens.read(), isNull);
    expect(app.location, '/login');
  });

  testWidgets('annulation dans le SDK natif : aucun appel, aucun message', (
    tester,
  ) async {
    final app = TestApp();
    app.social.credential = null;
    await app.pump(tester);

    await tap(tester, find.text('Continuer avec Apple'));

    expect(app.api.requests, isEmpty);
    expect(app.location, '/login');
  });

  testWidgets('adresse déjà utilisée (409) : message de rattachement', (
    tester,
  ) async {
    final app = TestApp();
    app.api.on(
      'POST /auth/social',
      (_) => FakeResponse.problem(409, 'Conflict'),
    );
    await app.pump(tester);

    await tap(tester, find.text('Continuer avec Google'));

    expect(
      find.textContaining('Un compte existe déjà avec cette adresse'),
      findsOneWidget,
    );
  });
}
