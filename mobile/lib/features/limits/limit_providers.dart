import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/limits/limit_api.dart';
import '../../core/limits/limit_models.dart';
import '../../providers.dart';
import '../expenses/expense_providers.dart';

final limitApiProvider = Provider<LimitApi>(
  (ref) => LimitApi(ref.watch(apiClientProvider)),
);

/// Jauge et réglages lus sous une session donnée : une écriture préparée
/// à partir de ces données ne vaut que pour cette session et ce carnet.
class LimitScreenData {
  const LimitScreenData(this.overview, this.notebookId, this.epoch);

  final LimitOverview overview;
  final String notebookId;
  final String epoch;
}

/// Jauge et réglages de la limite, lus en ligne (ADR-053) : rien n'est
/// calculé sur l'appareil (invariant 8).
final limitOverviewProvider = FutureProvider.autoDispose<LimitScreenData>(
  retry: (_, _) => null,
  (ref) async {
    final epochs = ref.read(accountEpochProvider);
    final epoch = await epochs.read();
    if (epoch == null) throw const LimitError(LimitFailure.offline);
    final account = await ref.watch(accountContextProvider.future);
    final overview = await ref
        .read(limitApiProvider)
        .overview(account.notebookId);
    // Réponse obtenue sous une autre session : ne pas l'afficher.
    if (await epochs.read() != epoch) {
      throw const LimitError(LimitFailure.offline);
    }
    return LimitScreenData(overview, account.notebookId, epoch);
  },
);

/// Enregistre [write], préparée à partir de [data], puis recharge la jauge.
/// Lève [LimitError] ; session changée avant ou pendant la requête →
/// [LimitFailure.offline] (aucun verdict, aucun succès annoncé). [ref] n'est
/// plus utilisé après la requête si l'écran a été fermé entre-temps.
Future<void> writeLimit(
  WidgetRef ref,
  LimitScreenData data,
  LimitWrite write,
) async {
  final epochs = ref.read(accountEpochProvider);
  final api = ref.read(limitApiProvider);
  Future<bool> sameSession() async {
    try {
      return await epochs.read() == data.epoch;
    } on Object {
      return false;
    }
  }

  if (!await sameSession()) throw const LimitError(LimitFailure.offline);
  try {
    try {
      await api.write(data.notebookId, write);
    } on Object {
      if (!await sameSession()) throw const LimitError(LimitFailure.offline);
      rethrow;
    }
    if (!await sameSession()) throw const LimitError(LimitFailure.offline);
  } finally {
    // Succès comme conflit : l'état du serveur a pu changer. Écran fermé :
    // la jauge (autoDispose) n'est plus lue.
    if (ref.context.mounted) ref.invalidate(limitOverviewProvider);
  }
}
