import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/notifications/notification_api.dart';
import '../../core/push/push_service.dart';
import '../../core/secure/secure_store.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';

/// Identifiant d'appareil (UUID v7 tiré une fois, conservé hors session).
const deviceIdKey = 'push.v1.device_id';

/// Attente maximale du retrait de l'appareil à la déconnexion.
const unregisterTimeout = Duration(seconds: 5);

/// Enregistre le jeton de l'appareil auprès de l'API (ADR-035/056). Au mieux :
/// une erreur n'interrompt rien, l'enregistrement est retenté au démarrage suivant.
/// Le jeton n'est jamais journalisé. Les opérations sont sérialisées.
class DeviceRegistrar {
  DeviceRegistrar(
    this._push,
    this._store,
    this._api, {
    String Function()? newId,
  }) : _newId = newId ?? const Uuid().v7;

  final PushService _push;
  final SecureStore _store;
  final NotificationApi _api;
  final String Function() _newId;
  Future<void> _serial = Future.value();

  Stream<String> get tokenRefreshes => _push.tokenRefreshes;

  Future<void> _run(Future<void> Function() op) {
    final next = _serial.then((_) => op()).catchError((Object _) {});
    _serial = next;
    return next;
  }

  /// Vrai entre le début d'une déconnexion et la session suivante : un nouveau
  /// jeton reçu entre-temps ne doit pas rattacher l'appareil au compte quitté.
  bool _closing = false;

  /// Demande l'autorisation, puis `PUT /me/devices/:id` avec [token] (nouveau
  /// jeton signalé par le système) ou le jeton courant (ouverture de session).
  Future<void> register({String? token}) {
    if (token == null) _closing = false;
    return _run(() async {
      final platform = _push.platform;
      if (platform == null || _closing) return;
      final value = token ?? await _push.requestToken();
      if (value == null || _closing) return;
      var id = await _store.read(deviceIdKey);
      if (id == null) {
        id = _newId();
        await _store.write(deviceIdKey, id);
      }
      try {
        await _api.registerDevice(id, platform, value);
      } on NotificationApiException catch (e) {
        // Identifiant resté attaché à un autre compte (retrait manqué) : on en tire un neuf.
        if (e.status != 409) rethrow;
        id = _newId();
        await _store.write(deviceIdKey, id);
        await _api.registerDevice(id, platform, value);
      }
    });
  }

  /// Retire l'appareil du compte (avant d'effacer la session), hors de la file :
  /// un enregistrement en attente (dialogue d'autorisation) ne la retarde pas.
  /// Borné dans le temps, erreurs ignorées : hors ligne, la déconnexion n'attend pas.
  Future<void> unregister() async {
    _closing = true;
    try {
      final id = await _store.read(deviceIdKey);
      if (id == null) return;
      await _api.unregisterDevice(id).timeout(unregisterTimeout);
    } on Object {
      // Au mieux (ADR-056).
    }
  }
}

final pushServiceProvider = Provider<PushService>(
  (ref) => platformPushService(),
);

final notificationApiProvider = Provider<NotificationApi>(
  (ref) => NotificationApi(ref.watch(apiClientProvider)),
);

final deviceRegistrarProvider = Provider<DeviceRegistrar>(
  (ref) => DeviceRegistrar(
    ref.watch(pushServiceProvider),
    ref.watch(secureStoreProvider),
    ref.watch(notificationApiProvider),
  ),
);

/// Écouté par l'app : enregistre l'appareil à chaque ouverture de session (et au
/// démarrage si une session existe), puis à chaque nouveau jeton.
final pushRegistrationProvider = Provider<void>((ref) {
  final registrar = ref.watch(deviceRegistrarProvider);
  StreamSubscription<String>? refreshes;
  ref.listen(authControllerProvider, (previous, next) {
    final signedIn = next.value == AuthStatus.signedIn;
    if (signedIn && previous?.value != AuthStatus.signedIn) {
      registrar.register();
      refreshes ??= registrar.tokenRefreshes.listen(
        (token) => registrar.register(token: token),
        onError: (Object _) {},
      );
    } else if (!signedIn && !next.isLoading) {
      refreshes?.cancel();
      refreshes = null;
    }
  }, fireImmediately: true);
  ref.onDispose(() => refreshes?.cancel());
});
