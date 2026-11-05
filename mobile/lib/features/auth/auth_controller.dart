import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_api.dart';
import '../../core/auth/reinstall_guard.dart';
import '../../core/auth/social_sign_in.dart';
import '../../providers.dart';
import '../notifications/push_registration.dart';

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
    // Nouvelle session de compte : la copie locale du contexte est périmée.
    await ref.read(accountEpochProvider).rotate();
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
    await ref.read(accountEpochProvider).rotate();
    await ref.read(tokenStoreProvider).save(tokens);
    state = const AsyncData(AuthStatus.signedIn);
  }

  /// Déconnexion : révocation serveur au mieux (hors ligne, la session locale part quand même).
  Future<void> logout() async {
    final store = ref.read(tokenStoreProvider);
    final session = await store.read();
    // Avant d'effacer la session : l'appareil ne doit plus recevoir les
    // notifications de ce compte (au mieux, borné dans le temps).
    if (session != null) await ref.read(deviceRegistrarProvider).unregister();
    await store.clear();
    _clearSharedFiles();
    try {
      await ref.read(accountEpochProvider).clear();
    } on Object {
      // Au mieux : la connexion suivante renouvelle de toute façon le marqueur.
    }
    state = const AsyncData(AuthStatus.signedOut);
    if (session != null) {
      try {
        await ref.read(authApiProvider).logout(session.refreshToken);
      } on AuthException {
        // Le jeton expirera seul (30 j glissants, ADR-018).
      }
    }
  }

  /// Après `DELETE /me` réussi (F-AUTH-07, ADR-057) : plus de révocation à
  /// demander (les jetons sont déjà invalides) ; la copie locale des données
  /// du compte et les fichiers d'export partagés sont effacés.
  /// [settleSync] attend la fin du passage de synchro en cours (fourni par
  /// l'appelant : la synchro dépend elle-même de la session).
  Future<void> accountDeleted({Future<void> Function()? settleSync}) async {
    // Chaque étape au mieux : un échec n'empêche ni les suivantes ni la sortie.
    Future<void> step(Future<void> Function() action) async {
      try {
        await action();
      } on Object {
        // La synchro de la connexion suivante purge les autres carnets.
      }
    }

    try {
      await step(() => ref.read(deviceRegistrarProvider).forget());
      await step(() => ref.read(tokenStoreProvider).clear());
      // Marqueur effacé : un passage de synchro s'arrête à son prochain
      // contrôle ; on attend sa fin pour qu'il n'écrive pas après la purge.
      await step(() => ref.read(accountEpochProvider).clear());
      if (settleSync != null) await step(settleSync);
      await step(() => ref.read(fileSharerProvider).clear());
      await step(() async {
        final db = await ref.read(databaseProvider.future);
        await db.wipeAll();
      });
    } finally {
      state = const AsyncData(AuthStatus.signedOut);
    }
  }

  /// Copies en clair des exports : jamais laissées au compte suivant (ADR-057).
  void _clearSharedFiles() =>
      ref.read(fileSharerProvider).clear().catchError((Object _) {}).ignore();

  /// Refresh refusé par l'API : jetons déjà effacés par le client HTTP.
  void sessionExpired() {
    state = const AsyncData(AuthStatus.signedOut);
    _clearSharedFiles();
    // Au mieux : la connexion suivante renouvelle de toute façon le marqueur.
    ref.read(accountEpochProvider).clear().ignore();
  }
}
