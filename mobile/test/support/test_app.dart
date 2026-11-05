import 'dart:io';

import 'package:depenseo/app.dart';
import 'package:depenseo/core/auth/auth_api.dart' show SocialProvider;
import 'package:depenseo/core/auth/reinstall_guard.dart';
import 'package:depenseo/core/auth/social_sign_in.dart';
import 'package:depenseo/core/auth/token_store.dart';
import 'package:depenseo/core/lock/biometric_auth.dart';
import 'package:depenseo/core/lock/screen_security.dart';
import 'package:depenseo/providers.dart';
import 'package:depenseo/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'fake_api.dart';
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
  }) async {
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
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: DepenseoApp(locale: locale),
      ),
    );
    await settle(tester);
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
