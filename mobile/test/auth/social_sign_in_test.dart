import 'package:depenseo/core/auth/auth_api.dart';
import 'package:depenseo/core/auth/nonce.dart';
import 'package:depenseo/core/auth/social_sign_in.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Apple : le fournisseur reçoit sha256(brut), l’API le brut (ADR-020)',
    () async {
      String? claim;
      final sdk = PlatformSocialSignIn(
        appleSupported: true,
        apple: (hashed) async {
          claim = hashed;
          return 'apple-id-token';
        },
      );

      final credential = await sdk.signIn(SocialProvider.apple);

      expect(credential!.idToken, 'apple-id-token');
      expect(claim, sha256Hex(credential.nonce));
      expect(credential.nonce, isNot(claim));
    },
  );

  test('Apple : nonce neuf à chaque tentative ; annulation → null', () async {
    final claims = <String>[];
    var cancel = false;
    final sdk = PlatformSocialSignIn(
      apple: (hashed) async {
        claims.add(hashed);
        return cancel ? null : 't';
      },
    );

    await sdk.signIn(SocialProvider.apple);
    await sdk.signIn(SocialProvider.apple);
    cancel = true;

    expect(await sdk.signIn(SocialProvider.apple), isNull);
    expect(claims.toSet(), hasLength(3));
  });

  test('Google : un seul initialize, nonce du processus cohérent', () async {
    final claims = <String>[];
    final sdk = PlatformSocialSignIn(
      googleInitialize: (hashed) async => claims.add(hashed),
      googleAuthenticate: () async => 'google-id-token',
    );

    final first = await sdk.signIn(SocialProvider.google);
    final second = await sdk.signIn(SocialProvider.google);

    expect(claims, [sha256Hex(first!.nonce)]);
    expect(second!.nonce, first.nonce);
  });

  test('Google : initialize en échec, nouvel essai possible', () async {
    var fail = true;
    var calls = 0;
    final sdk = PlatformSocialSignIn(
      googleInitialize: (_) async {
        calls++;
        if (fail) throw StateError('init');
      },
      googleAuthenticate: () async => 't',
    );

    await expectLater(sdk.signIn(SocialProvider.google), throwsStateError);
    fail = false;

    expect(await sdk.signIn(SocialProvider.google), isNotNull);
    expect(calls, 2);
  });

  test('Apple indisponible hors iOS', () {
    expect(
      PlatformSocialSignIn(appleSupported: false)
          .isAvailable(SocialProvider.apple),
      isFalse,
    );
  });
}
