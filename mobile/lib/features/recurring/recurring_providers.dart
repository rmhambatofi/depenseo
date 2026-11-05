import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/account/account_context.dart';
import '../../core/db/app_database.dart';
import '../../core/recurring/recurring_api.dart';
import '../../providers.dart';
import '../expenses/expense_providers.dart';
import '../sync/sync_controller.dart';

final recurringApiProvider = Provider<RecurringApi>(
  (ref) => RecurringApi(ref.watch(apiClientProvider)),
);

/// Récurrences lues sous une session donnée : une écriture préparée à partir
/// de ces données ne vaut que pour cette session et ce carnet.
class RecurringScreenData {
  const RecurringScreenData(
    this.overview,
    this.account,
    this.categories,
    this.epoch,
  );

  final RecurringOverview overview;
  final AccountContext account;

  /// Catégories proposées dans le formulaire (base locale).
  final List<Category> categories;
  final String epoch;

  String get notebookId => account.notebookId;

  Recurring? byId(String id) =>
      overview.recurring.where((r) => r.id == id).firstOrNull;
}

/// Récurrences et échéances en attente, lues en ligne (ADR-054) : les
/// échéances sont calculées par l'API (invariant 8).
final recurringOverviewProvider =
    FutureProvider.autoDispose<RecurringScreenData>(retry: (_, _) => null, (
      ref,
    ) async {
      final epochs = ref.read(accountEpochProvider);
      final epoch = await epochs.read();
      if (epoch == null) throw const RecurringError(RecurringFailure.offline);
      final account = await ref.watch(accountContextProvider.future);
      final db = await ref.watch(databaseProvider.future);
      final categories = await db.selectableCategories(account.notebookId);
      final overview = await ref
          .read(recurringApiProvider)
          .overview(account.notebookId);
      // Réponse obtenue sous une autre session : ne pas l'afficher.
      if (await epochs.read() != epoch) {
        throw const RecurringError(RecurringFailure.offline);
      }
      return RecurringScreenData(overview, account, categories, epoch);
    });

/// Exécute [write] sous la session de [data], puis recharge les récurrences.
/// Lève [RecurringError] ; session changée avant ou pendant la requête →
/// [RecurringFailure.offline] (aucun succès annoncé). [syncAfter] : l'écriture
/// a pu créer une dépense (paiement) que la synchro doit rapatrier.
Future<void> writeRecurring(
  WidgetRef ref,
  RecurringScreenData data,
  Future<void> Function(RecurringApi api, String notebookId) write, {
  bool syncAfter = false,
}) async {
  // Lus avant le premier `await` : l'écran peut être fermé ensuite.
  final epochs = ref.read(accountEpochProvider);
  final api = ref.read(recurringApiProvider);
  final sync = ref.read(syncControllerProvider.notifier);
  // Conteneur racine : la liste (sous le formulaire) est rechargée même si
  // le formulaire est fermé pendant la requête.
  final container = ProviderScope.containerOf(ref.context, listen: false);
  Future<bool> sameSession() async {
    try {
      return await epochs.read() == data.epoch;
    } on Object {
      return false;
    }
  }

  if (!await sameSession()) {
    throw const RecurringError(RecurringFailure.offline);
  }
  try {
    try {
      await write(api, data.notebookId);
    } on Object {
      if (!await sameSession()) {
        throw const RecurringError(RecurringFailure.offline);
      }
      rethrow;
    }
    if (!await sameSession()) {
      throw const RecurringError(RecurringFailure.offline);
    }
    if (syncAfter) sync.request().ignore();
  } finally {
    container.invalidate(recurringOverviewProvider);
  }
}
