import 'dart:io' show Platform;

import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart' hide generateNonce;

import 'auth_api.dart';
import 'nonce.dart';

/// Résultat d'une connexion native : `id_token` et nonce **brut** à transmettre à l'API.
class SocialCredential {
  const SocialCredential({required this.idToken, required this.nonce});

  final String idToken;
  final String nonce;
}

/// Obtention d'un `id_token` auprès d'Apple ou Google (SDK natifs). `null` = annulé.
abstract interface class SocialSignIn {
  bool isAvailable(SocialProvider provider);
  Future<SocialCredential?> signIn(SocialProvider provider);
}

/// Client OAuth « serveur » Google (exigé sur Android pour obtenir un `id_token`).
const _googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

/// Appels aux SDK natifs, remplaçables en test. Chacun reçoit l'empreinte du nonce
/// (claim `nonce` du jeton) et renvoie l'`id_token`, `null` si l'utilisateur annule.
typedef AppleAuthorize = Future<String?> Function(String hashedNonce);
typedef GoogleInitialize = Future<void> Function(String hashedNonce);
typedef GoogleAuthenticate = Future<String?> Function();

class PlatformSocialSignIn implements SocialSignIn {
  PlatformSocialSignIn({
    bool? appleSupported,
    AppleAuthorize? apple,
    GoogleInitialize? googleInitialize,
    GoogleAuthenticate? googleAuthenticate,
  }) : _appleSupported = appleSupported ?? Platform.isIOS,
       _appleAuthorize = apple ?? _sdkApple,
       _googleInitialize = googleInitialize ?? _sdkGoogleInitialize,
       _googleAuthenticate = googleAuthenticate ?? _sdkGoogleAuthenticate;

  // Apple sur Android exige un flux web (Services ID) : hors MVP (ADR-047).
  final bool _appleSupported;
  final AppleAuthorize _appleAuthorize;
  final GoogleInitialize _googleInitialize;
  final GoogleAuthenticate _googleAuthenticate;

  /// Google n'accepte qu'un `initialize` par processus : son nonce vaut pour la durée
  /// du processus (rejeu borné par l'âge maximal du jeton côté API, ADR-020).
  Future<String>? _googleNonce;

  @override
  bool isAvailable(SocialProvider provider) => switch (provider) {
    SocialProvider.apple => _appleSupported,
    SocialProvider.google => true,
  };

  @override
  Future<SocialCredential?> signIn(SocialProvider provider) =>
      switch (provider) {
        SocialProvider.apple => _apple(),
        SocialProvider.google => _google(),
      };

  Future<SocialCredential?> _apple() async {
    final nonce = generateNonce();
    final idToken = await _appleAuthorize(sha256Hex(nonce));
    return idToken == null
        ? null
        : SocialCredential(idToken: idToken, nonce: nonce);
  }

  Future<SocialCredential?> _google() async {
    final nonce = await (_googleNonce ??= _initGoogle());
    final idToken = await _googleAuthenticate();
    return idToken == null
        ? null
        : SocialCredential(idToken: idToken, nonce: nonce);
  }

  Future<String> _initGoogle() async {
    final nonce = generateNonce();
    try {
      await _googleInitialize(sha256Hex(nonce));
    } on Object {
      _googleNonce = null; // nouvel essai possible sans redémarrer l'app
      rethrow;
    }
    return nonce;
  }
}

Future<String?> _sdkApple(String hashedNonce) async {
  try {
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: const [AppleIDAuthorizationScopes.email],
      nonce: hashedNonce,
    );
    return credential.identityToken;
  } on SignInWithAppleAuthorizationException catch (e) {
    if (e.code == AuthorizationErrorCode.canceled) return null;
    rethrow;
  }
}

Future<void> _sdkGoogleInitialize(String hashedNonce) =>
    GoogleSignIn.instance.initialize(
      serverClientId: _googleServerClientId.isEmpty
          ? null
          : _googleServerClientId,
      nonce: hashedNonce,
    );

Future<String?> _sdkGoogleAuthenticate() async {
  try {
    final account = await GoogleSignIn.instance.authenticate();
    return account.authentication.idToken;
  } on GoogleSignInException catch (e) {
    if (e.code == GoogleSignInExceptionCode.canceled) return null;
    rethrow;
  }
}
