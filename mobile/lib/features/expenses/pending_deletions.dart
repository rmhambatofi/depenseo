import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/expense_store.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';
import '../sync/sync_controller.dart';
import 'expense_providers.dart';

/// Délai d'annulation d'une suppression (F-DEP-10).
const undoWindow = Duration(seconds: 5);

/// Suppressions en attente (ADR-051) : la dépense est masquée tout de suite,
/// mais rien n'est écrit avant la fin du délai ; « Annuler » n'a donc rien à
/// défaire, ni localement ni sur le serveur. Abandonnées au changement de
/// session.
final pendingDeletionsProvider =
    NotifierProvider<PendingDeletions, Set<String>>(PendingDeletions.new);

class PendingDeletions extends Notifier<Set<String>> {
  final _timers = <String, Timer>{};

  @override
  Set<String> build() {
    ref.watch(authControllerProvider.select((s) => s.value));
    ref.onDispose(_cancelAll);
    return const {};
  }

  void _cancelAll() {
    for (final t in _timers.values) {
      t.cancel();
    }
    _timers.clear();
  }

  void delete(String id) {
    _timers.remove(id)?.cancel();
    state = {...state, id};
    _timers[id] = Timer(undoWindow, () => _commit(id));
  }

  /// `false` si le délai est écoulé (suppression déjà écrite).
  bool undo(String id) {
    final timer = _timers.remove(id);
    if (timer == null) return false;
    timer.cancel();
    state = {...state}..remove(id);
    return true;
  }

  Future<void> _commit(String id) async {
    _timers.remove(id);
    try {
      final db = await ref.read(databaseProvider.future);
      await db.markExpenseDeleted(id, ref.read(clockProvider)());
    } on Object catch (e, stack) {
      // Écriture impossible : la dépense réapparaît (sans données au journal).
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: e.runtimeType,
          stack: stack,
          library: 'depenseo expenses',
        ),
      );
    }
    if (!ref.mounted) return;
    // Masquée jusqu'à la relecture de la base, sans réapparition fugace.
    refreshLocalExpenses(ref.invalidate);
    state = {...state}..remove(id);
    ref.read(syncControllerProvider.notifier).request().ignore();
  }
}

/// Supprime [id] après [undoWindow] et propose « Annuler » pendant ce délai.
void deleteWithUndo(BuildContext context, WidgetRef ref, String id) {
  final l10n = AppLocalizations.of(context);
  final deletions = ref.read(pendingDeletionsProvider.notifier)..delete(id);
  final messenger = ScaffoldMessenger.of(context);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        key: const Key('undo-delete-snackbar'),
        content: Text(l10n.expenseDeleted),
        duration: undoWindow,
        // Avec une action, une SnackBar persiste par défaut : elle doit
        // disparaître avec le délai d'annulation.
        persist: false,
        action: SnackBarAction(
          key: const Key('undo-delete'),
          label: l10n.undo,
          onPressed: () {
            // Appui pendant l'animation de sortie, délai écoulé : le dire.
            if (!deletions.undo(id)) {
              messenger.showSnackBar(SnackBar(content: Text(l10n.undoTooLate)));
            }
          },
        ),
      ),
    );
}
