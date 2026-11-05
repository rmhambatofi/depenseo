import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/account/account_context.dart';
import '../../core/sync/sync_engine.dart';
import '../../providers.dart';
import '../expenses/expense_providers.dart';

enum SyncPhase { idle, syncing, upToDate, offline }

/// Délais des nouveaux essais après un échec (le dernier se répète) ; vide =
/// pas de nouvel essai automatique (tests).
final syncRetryDelaysProvider = Provider<List<Duration>>(
  (ref) => const [
    Duration(seconds: 15),
    Duration(minutes: 1),
    Duration(minutes: 5),
  ],
);

/// Synchro automatique ; désactivée par les tests widget qui ne l'exercent pas.
final syncEnabledProvider = Provider<bool>((ref) => true);

/// Déclenche la synchro (ADR-050) : contexte du compte prêt, après chaque
/// saisie, au retour au premier plan, puis par nouveaux essais espacés tant
/// que le réseau manque (« au retour du réseau » sans sonde de connectivité).
final syncControllerProvider = NotifierProvider<SyncController, SyncPhase>(
  SyncController.new,
);

class SyncController extends Notifier<SyncPhase> {
  Timer? _retry;
  int _failures = 0;
  bool _running = false;
  bool _again = false;

  @override
  SyncPhase build() {
    final lifecycle = AppLifecycleListener(onResume: request);
    ref.onDispose(() {
      _retry?.cancel();
      lifecycle.dispose();
    });
    ref.listen(accountContextProvider, (previous, next) {
      if (next.hasError) _retry?.cancel();
      final notebook = next.value?.notebookId;
      if (notebook != null && notebook != previous?.value?.notebookId) {
        _failures = 0;
        // Hors de `build` : la synchro modifie l'état.
        scheduleMicrotask(request);
      }
    }, fireImmediately: true);
    return SyncPhase.idle;
  }

  /// Lance une synchro, ou en programme une autre si l'une est en cours.
  Future<void> request() async {
    if (!ref.read(syncEnabledProvider)) return;
    if (_running) {
      _again = true;
      return;
    }
    _running = true;
    _retry?.cancel();
    try {
      do {
        _again = false;
        await _runOnce();
      } while (_again);
    } finally {
      _running = false;
    }
  }

  Future<void> _runOnce() async {
    final epochs = ref.read(accountEpochProvider);
    final String? epoch;
    final AccountContext account;
    try {
      epoch = await epochs.read();
      account = await ref.read(accountContextProvider.future);
    } on Object {
      // Hors session, ou contexte jamais chargé : rien à synchroniser.
      if (ref.mounted) state = SyncPhase.idle;
      return;
    }
    if (!ref.mounted) return;
    if (epoch == null) {
      state = SyncPhase.idle;
      return;
    }
    state = SyncPhase.syncing;
    try {
      final db = await ref.read(databaseProvider.future);
      final engine = SyncEngine(
        ref.read(apiClientProvider),
        db,
        // Déconnexion ou autre compte pendant le passage : arrêt sans rien acquitter.
        stillCurrent: () async => await epochs.read() == epoch,
      );
      await engine.run(account.notebookId);
      if (!ref.mounted) return;
      _failures = 0;
      state = SyncPhase.upToDate;
    } on Object catch (e, stack) {
      if (!ref.mounted) return;
      if (e is DioException && e.response?.statusCode == 401) {
        // Session expirée : le client HTTP a déjà déconnecté.
        state = SyncPhase.idle;
        return;
      }
      if (e is! SyncUnavailable) {
        // Réponse inattendue ou défaut du code : signalé (sans données :
        // types et pile seulement), puis nouvel essai comme hors ligne.
        FlutterError.reportError(
          FlutterErrorDetails(
            exception: e.runtimeType,
            stack: stack,
            library: 'depenseo sync',
          ),
        );
      }
      state = SyncPhase.offline;
      _scheduleRetry();
    } finally {
      if (ref.mounted) {
        // Pas `quickEntryDataProvider` : le formulaire ouvert serait réinitialisé.
        refreshLocalExpenses(ref.invalidate);
      }
    }
  }

  void _scheduleRetry() {
    final delays = ref.read(syncRetryDelaysProvider);
    if (delays.isEmpty) return;
    final delay = delays[_failures.clamp(0, delays.length - 1)];
    _failures++;
    _retry?.cancel();
    _retry = Timer(delay, request);
  }
}
