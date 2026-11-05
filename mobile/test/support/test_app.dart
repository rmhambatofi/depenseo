import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:depenseo/app.dart';
import 'package:depenseo/core/auth/auth_api.dart' show SocialProvider;
import 'package:depenseo/core/auth/reinstall_guard.dart';
import 'package:depenseo/core/auth/social_sign_in.dart';
import 'package:depenseo/core/auth/token_store.dart';
import 'package:depenseo/core/files/file_sharer.dart';
import 'package:depenseo/core/lock/biometric_auth.dart';
import 'package:depenseo/core/lock/screen_security.dart';
import 'package:depenseo/core/push/push_service.dart';
import 'package:depenseo/features/account/account_screen.dart';
import 'package:depenseo/features/notifications/push_registration.dart';
import 'package:depenseo/features/premium/premium_providers.dart';
import 'package:depenseo/features/sync/sync_controller.dart';
import 'package:depenseo/providers.dart';
import 'package:depenseo/router.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'fake_api.dart';
import 'fake_store.dart';
import 'memory_secure_store.dart';

/// SDK natifs Apple/Google simulés : renvoie [credential] (`null` = annulé).
class FakeSocialSignIn implements SocialSignIn {
  SocialCredential? credential = const SocialCredential(
    idToken: 'id-token',
    nonce: 'raw-nonce',
  );
  final List<SocialProvider> calls = [];

  @override
  bool isAvailable(SocialProvider provider) => true;

  @override
  Future<SocialCredential?> signIn(SocialProvider provider) async {
    calls.add(provider);
    return credential;
  }
}

/// Horloge murale réglable à la main.
/// Fichiers remis à la feuille de partage ; [cleared] compte les effacements.
class FakeFileSharer implements FileSharer {
  final List<({String name, String mime, Uint8List bytes})> shared = [];
  int cleared = 0;

  @override
  Future<void> share(
    String fileName,
    String mimeType,
    Uint8List bytes, {
    Rect? origin,
  }) async => shared.add((name: fileName, mime: mimeType, bytes: bytes));

  @override
  Future<void> clear() async => cleared++;
}

class FakeClock {
  DateTime now = DateTime.utc(2026, 11, 5, 9);
  void advance(Duration d) => now = now.add(d);
}

/// Biométrie simulée : [result] renvoyé à chaque demande, comptée dans [prompts].
class FakeBiometrics implements BiometricAuth {
  bool available = true;
  bool result = true;
  int prompts = 0;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<bool> authenticate(String reason) async {
    prompts++;
    return result;
  }
}

class FakeScreenSecurity implements ScreenSecurity {
  bool secure = false;

  @override
  bool get supported => true;

  @override
  Future<void> setSecure(bool secure) async => this.secure = secure;
}

/// Notifications simulées : [token] `null` (défaut) = autorisation refusée ;
/// aucune requête d'appareil dans les tests qui ne l'exercent pas.
class FakePushService implements PushService {
  @override
  PushPlatform? platform = PushPlatform.android;
  String? token;
  int requests = 0;
  final StreamController<String> refreshes = StreamController.broadcast();

  @override
  Future<String?> requestToken() async {
    requests++;
    return token;
  }

  @override
  Stream<String> get tokenRefreshes => refreshes.stream;
}

/// Coffre qui échoue à la lecture tant que [failing] est vrai (trousseau verrouillé).
class FlakySecureStore extends MemorySecureStore {
  bool failing = true;

  @override
  Future<String?> read(String key) async {
    if (failing) throw const FileSystemException('keychain locked');
    return super.read(key);
  }
}

/// Application complète sur un faux serveur. Le témoin d'installation est posé :
/// une session présente dans [store] est conservée (sauf [freshInstall]).
class TestApp {
  TestApp({MemorySecureStore? store}) : store = store ?? MemorySecureStore();

  final MemorySecureStore store;
  final FakeApi api = FakeApi();
  final FakeSocialSignIn social = FakeSocialSignIn();
  final FakeClock clock = FakeClock();
  final FakeBiometrics biometrics = FakeBiometrics();
  final FakeScreenSecurity screen = FakeScreenSecurity();
  final FakePushService push = FakePushService();
  final FakeFileSharer files = FakeFileSharer();
  final FakeStore storeGateway = FakeStore();

  /// Liens ouverts hors de l'app (gestion de l'abonnement).
  final List<Uri> openedUrls = [];

  /// Nouveaux essais de synchro : aucun par défaut (pas de minuterie en fin de test).
  List<Duration> syncRetryDelays = const [];

  /// Synchro automatique : coupée sauf dans les tests qui l'exercent.
  bool syncEnabled = false;
  late final ProviderContainer container;
  late final Directory dir;

  TokenStore get tokens => TokenStore(store);
  GoRouter get router => container.read(routerProvider);

  Future<void> signIn() => tokens.save(
    const SessionTokens(accessToken: 'access', refreshToken: 'refresh'),
  );

  Future<void> pump(
    WidgetTester tester, {
    Locale locale = const Locale('fr'),
    bool freshInstall = false,

    /// Faux : rend la main dès le premier rendu (mesure du démarrage, P7-06).
    bool settleAfter = true,
  }) async {
    // Une base neuve par test, fermée de façon asynchrone par le conteneur.
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    dir = Directory.systemTemp.createTempSync('depenseo_app');
    if (!freshInstall) {
      File('${dir.path}/$installMarkerName').writeAsStringSync('1');
    }
    addTearDown(() => dir.deleteSync(recursive: true));
    container = ProviderContainer(
      overrides: [
        secureStoreProvider.overrideWithValue(store),
        httpAdapterProvider.overrideWithValue(api),
        appSupportDirProvider.overrideWith((ref) async => dir),
        socialSignInProvider.overrideWithValue(social),
        clockProvider.overrideWithValue(() => clock.now),
        biometricAuthProvider.overrideWithValue(biometrics),
        screenSecurityProvider.overrideWithValue(screen),
        pushServiceProvider.overrideWithValue(push),
        fileSharerProvider.overrideWithValue(files),
        storeGatewayProvider.overrideWithValue(storeGateway),
        urlOpenerProvider.overrideWithValue((uri) async {
          openedUrls.add(uri);
          return true;
        }),
        // Interrogation des exports sans attente réelle.
        exportSleepProvider.overrideWithValue((_) async {}),
        syncRetryDelaysProvider.overrideWith((ref) => syncRetryDelays),
        syncEnabledProvider.overrideWith((ref) => syncEnabled),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: DepenseoApp(locale: locale),
      ),
    );
    if (settleAfter) await settle(tester);
  }

  /// Laisse aboutir les vraies E/S (témoin d'installation) hors de l'horloge simulée,
  /// jusqu'à la sortie de l'écran de démarrage (dont l'indicateur ne se stabilise jamais).
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 50 && location == '/splash'; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump();
    }
    await tester.pumpAndSettle();
  }

  String get location =>
      router.routerDelegate.currentConfiguration.uri.toString();
}

/// Saisit le texte dans le champ de clé [key].
Future<void> enter(WidgetTester tester, String key, String text) =>
    tester.enterText(find.byKey(Key(key)), text);

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// Touche puis laisse passer les animations sans attendre la stabilité
/// (un indicateur d'attente reste animé tant qu'un dialogue est ouvert).
Future<void> tapAndPump(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}
