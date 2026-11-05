import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_api.dart';
import '../../core/auth/reinstall_guard.dart';
import '../../core/auth/social_sign_in.dart';
import '../../providers.dart';

enum AuthStatus { signedOut, signedIn }

/// État de session de l'app. En erreur si le stockage sécurisé est illisible
/// (trousseau verrouillé ou corrompu) : l'app affiche alors un écran dédié.
final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthStatus>(
      AuthController.new,
      // Pas de nouvel essai automatique : l'utilisateur relance depuis l'écran d'erreur.
      retry: (_, _) => null,
    );

class AuthController extends AsyncNotifier<AuthStatus> {
  @override
  Future<AuthStatus> build() async {
    final tokens = ref.read(tokenStoreProvider);
    await purgeTokensAfterReinstall(
      await ref.read(appSupportDirProvider.future),
      tokens,
    );
    return await tokens.read() == null
        ? AuthStatus.signedOut
        : AuthStatus.signedIn;
  }

  /// Nouvel essai après une erreur de stockage sécurisé.
  void retry() => ref.invalidateSelf();

  Future<void> login(String email, String password) async {
    final tokens = await ref.read(authApiProvider).login(email, password);
    await ref.read(tokenStoreProvider).save(tokens);
    state = const AsyncData(AuthStatus.signedIn);
  }

  /// Connexion Apple/Google avec un `id_token` obtenu du SDK natif. Sur
  /// [AuthFailure.termsRequired] (nouveau compte), rejouer le même [credential]
  /// avec [acceptTerms] après consentement.
  Future<void> socialLogin(
    SocialProvider provider,
    SocialCredential credential, {
    required String language,
    bool acceptTerms = false,
  }) async {
    final tokens = await ref
        .read(authApiProvider)
        .social(
          provider: provider,
          idToken: credential.idToken,
          nonce: credential.nonce,
          language: language,
          acceptTerms: acceptTerms,
        );
    await ref.read(tokenStoreProvider).save(tokens);
    state = const AsyncData(AuthStatus.signedIn);
  }

  /// Déconnexion : révocation serveur au mieux (hors ligne, la session locale part quand même).
  Future<void> logout() async {
    final store = ref.read(tokenStoreProvider);
    final session = await store.read();
    await store.clear();
    state = const AsyncData(AuthStatus.signedOut);
    if (session != null) {
      try {
        await ref.read(authApiProvider).logout(session.refreshToken);
      } on AuthException {
        // Le jeton expirera seul (30 j glissants, ADR-018).
      }
    }
  }

  /// Refresh refusé par l'API : jetons déjà effacés par le client HTTP.
  void sessionExpired() => state = const AsyncData(AuthStatus.signedOut);
}
