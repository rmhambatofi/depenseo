import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/lock/lock_settings.dart';
import '../../core/lock/lock_store.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';

/// Issue d'une saisie de code sur l'écran de verrouillage.
enum PinResult { ok, wrong, signedOut }

class AppLockState {
  const AppLockState({
    required this.ready,
    this.settings = const LockSettings(),
    this.locked = false,
    this.failures = 0,
    this.biometricsAvailable = false,
  });

  /// `false` tant que les réglages ne sont pas lus : le contenu reste masqué.
  final bool ready;
  final LockSettings settings;
  final bool locked;
  final int failures;
  final bool biometricsAvailable;

  int get remainingAttempts => AppLockController.maxAttempts - failures;

  AppLockState copyWith({
    LockSettings? settings,
    bool? locked,
    int? failures,
  }) => AppLockState(
    ready: ready,
    settings: settings ?? this.settings,
    locked: locked ?? this.locked,
    failures: failures ?? this.failures,
    biometricsAvailable: biometricsAvailable,
  );
}

final appLockProvider = NotifierProvider<AppLockController, AppLockState>(
  AppLockController.new,
);

/// Verrou de l'app (F-AUTH-04, ADR-048) : verrouillée au démarrage si un code existe,
/// puis au retour au premier plan si l'arrière-plan a duré au moins le délai choisi.
class AppLockController extends Notifier<AppLockState> {
  static const maxAttempts = 5;

  DateTime? _hiddenAt;
  Future<void> _tail = Future.value();

  LockStore get _store => LockStore(ref.read(secureStoreProvider));

  @override
  AppLockState build() {
    // Immédiat : un code laissé par une session précédente ne survit pas.
    ref.listen(authControllerProvider, fireImmediately: true, (_, next) {
      if (next case AsyncData(value: AuthStatus.signedOut)) _onSignedOut();
    });
    _serial(_load);
    return const AppLockState(ready: false);
  }

  /// Exécute les opérations une à une (aucune lecture ne double une écriture en cours).
  Future<T> _serial<T>(Future<T> Function() op) {
    final result = _tail.then((_) => op());
    _tail = result.then((_) {}, onError: (_) {});
    return result;
  }

  Future<void> _load() async {
    final biometrics = await ref.read(biometricAuthProvider).isAvailable();
    try {
      final settings = await _store.load();
      state = AppLockState(
        ready: true,
        settings: settings,
        locked: settings.enabled,
        failures: await _store.failures(),
        biometricsAvailable: biometrics,
      );
    } catch (_) {
      // Coffre illisible : on reste fermé ; « code oublié » permet d'en sortir.
      state = AppLockState(
        ready: true,
        settings: const LockSettings(enabled: true),
        locked: true,
        biometricsAvailable: biometrics,
      );
    }
    await _applyScreenSecurity();
  }

  void _onSignedOut() => _serial(() async {
    _hiddenAt = null;
    try {
      await _store.clear();
    } finally {
      state = AppLockState(
        ready: true,
        biometricsAvailable: state.biometricsAvailable,
      );
      await _applyScreenSecurity();
    }
  });

  Future<void> _applyScreenSecurity() async {
    try {
      await ref
          .read(screenSecurityProvider)
          .setSecure(state.settings.blockScreenshots);
    } on Exception {
      // Plateforme sans support : l'option n'est pas proposée.
    }
  }

  /// L'app quitte l'écran (état `hidden`) : début du délai.
  void didHide() => _hiddenAt ??= ref.read(clockProvider)();

  /// L'app redevient visible : verrouille si le délai est écoulé
  /// (ou si l'horloge a reculé, pour ne pas offrir de contournement).
  void didShow() {
    final hiddenAt = _hiddenAt;
    _hiddenAt = null;
    if (hiddenAt == null || !state.settings.enabled || state.locked) return;
    final elapsed = ref.read(clockProvider)().difference(hiddenAt);
    if (elapsed.isNegative || elapsed >= state.settings.delay.duration) {
      state = state.copyWith(locked: true);
    }
  }

  Future<PinResult> unlockWithPin(String pin) => _serial(() async {
    // Échec compté avant la vérification : tuer l'app pendant le calcul ne l'efface pas.
    final failures = await _store.recordFailure();
    if (await _store.verifyPin(pin)) {
      await _store.resetFailures();
      state = state.copyWith(locked: false, failures: 0);
      return PinResult.ok;
    }
    state = state.copyWith(failures: failures);
    if (failures >= maxAttempts) {
      await ref.read(authControllerProvider.notifier).logout();
      return PinResult.signedOut;
    }
    return PinResult.wrong;
  });

  /// Proposée automatiquement par l'écran de verrouillage si activée.
  Future<void> unlockWithBiometrics(String reason) async {
    if (!state.locked || !state.settings.biometrics) return;
    if (!state.biometricsAvailable) return;
    if (await ref.read(biometricAuthProvider).authenticate(reason)) {
      await _serial(() async {
        await _store.resetFailures();
        state = state.copyWith(locked: false, failures: 0);
      });
    }
  }

  /// Code oublié : seule issue, la déconnexion (le verrou est effacé avec la session).
  Future<void> forgetAndSignOut() =>
      ref.read(authControllerProvider.notifier).logout();

  Future<void> enable(String pin) => _serial(() async {
    await _store.setPin(pin);
    state = state.copyWith(
      settings: state.settings.copyWith(enabled: true),
      locked: false,
      failures: 0,
    );
  });

  Future<void> disable() => _serial(() async {
    await _store.removePin();
    final settings = state.settings.copyWith(enabled: false, biometrics: false);
    await _store.savePrefs(settings);
    state = state.copyWith(settings: settings, locked: false, failures: 0);
  });

  Future<void> setDelay(LockDelay delay) =>
      _savePrefs((s) => s.copyWith(delay: delay));

  /// Activation soumise à une reconnaissance réussie ; renvoie l'état obtenu.
  Future<bool> setBiometrics(bool on, String reason) async {
    if (on && !await ref.read(biometricAuthProvider).authenticate(reason)) {
      return false;
    }
    await _savePrefs((s) => s.copyWith(biometrics: on && s.enabled));
    return state.settings.biometrics;
  }

  Future<void> setBlockScreenshots(bool on) async {
    await _savePrefs((s) => s.copyWith(blockScreenshots: on));
    await _applyScreenSecurity();
  }

  /// [update] est appliqué dans la file, sur l'état du moment (pas sur celui de l'appel).
  Future<void> _savePrefs(LockSettings Function(LockSettings) update) =>
      _serial(() async {
        final settings = update(state.settings);
        await _store.savePrefs(settings);
        state = state.copyWith(settings: settings);
      });
}
