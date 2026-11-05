import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

/// Plateforme déclarée à `PUT /me/devices/:id` (ADR-035).
enum PushPlatform { ios, android }

/// Jeton de notification de l'appareil : FCM sur Android, jeton APNs brut sur
/// iOS (l'API parle directement à APNs, ADR-035/056).
abstract interface class PushService {
  /// `null` : notifications indisponibles (plateforme ou configuration absente).
  PushPlatform? get platform;

  /// Demande l'autorisation si besoin puis renvoie le jeton ; `null` si refusée
  /// ou indisponible.
  Future<String?> requestToken();

  /// Changements de jeton signalés par le système.
  Stream<String> get tokenRefreshes;
}

/// Aucune notification (tests, ordinateur, build sans configuration Firebase).
class DisabledPushService implements PushService {
  const DisabledPushService();

  @override
  PushPlatform? get platform => null;

  @override
  Future<String?> requestToken() async => null;

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();
}

/// Configuration Firebase fournie à la compilation (`--dart-define`), aucun
/// fichier `google-services.json` / `GoogleService-Info.plist` dans le dépôt.
const _firebase = (
  apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
  projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
  senderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
  androidAppId: String.fromEnvironment('FIREBASE_ANDROID_APP_ID'),
  iosAppId: String.fromEnvironment('FIREBASE_IOS_APP_ID'),
  iosBundleId: String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID'),
);

/// Service de la plateforme : Firebase s'il est configuré, sinon désactivé.
PushService platformPushService() {
  final platform = Platform.isIOS
      ? PushPlatform.ios
      : Platform.isAndroid
      ? PushPlatform.android
      : null;
  final appId = platform == PushPlatform.ios
      ? _firebase.iosAppId
      : _firebase.androidAppId;
  if (platform == null ||
      appId.isEmpty ||
      _firebase.apiKey.isEmpty ||
      _firebase.projectId.isEmpty ||
      _firebase.senderId.isEmpty) {
    return const DisabledPushService();
  }
  return FirebasePushService(
    platform,
    FirebaseOptions(
      apiKey: _firebase.apiKey,
      appId: appId,
      messagingSenderId: _firebase.senderId,
      projectId: _firebase.projectId,
      iosBundleId: _firebase.iosBundleId.isEmpty ? null : _firebase.iosBundleId,
    ),
  );
}

class FirebasePushService implements PushService {
  FirebasePushService(this.platform, this._options);

  @override
  final PushPlatform platform;
  final FirebaseOptions _options;
  Future<FirebaseMessaging>? _messaging;

  Future<FirebaseMessaging> _instance() => _messaging ??= () async {
    if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: _options);
    return FirebaseMessaging.instance;
  }();

  @override
  Future<String?> requestToken() async {
    final messaging = await _instance();
    final settings = await messaging.requestPermission();
    if (settings.authorizationStatus != AuthorizationStatus.authorized &&
        settings.authorizationStatus != AuthorizationStatus.provisional) {
      return null;
    }
    return _currentToken(messaging);
  }

  Future<String?> _currentToken(FirebaseMessaging messaging) async {
    // Jeton d'enregistrement FCM attendu par `message.token` de l'API (ADR-035).
    if (platform == PushPlatform.android) return messaging.getToken();
    // Le jeton APNs arrive après l'enregistrement auprès d'Apple : quelques essais.
    for (var i = 0; i < 5; i++) {
      final token = await messaging.getAPNSToken();
      if (token != null) return token;
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    return null;
  }

  @override
  Stream<String> get tokenRefreshes async* {
    final messaging = await _instance();
    await for (final fcmToken in messaging.onTokenRefresh) {
      final token = platform == PushPlatform.android
          ? fcmToken
          : await _currentToken(messaging);
      if (token != null) yield token;
    }
  }
}
