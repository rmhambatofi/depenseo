import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/account/account_context.dart';
import '../../core/db/app_database.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';

/// Contexte du compte connecté ; relu à chaque changement de session.
/// Pas de nouvel essai automatique : l'écran de saisie propose « Réessayer ».
final accountContextProvider = FutureProvider<AccountContext>(retry: _noRetry, (
  ref,
) async {
  final status = ref.watch(authControllerProvider).value;
  if (status != AuthStatus.signedIn) throw const AccountContextUnavailable();
  final epochs = ref.read(accountEpochProvider);
  final epoch = await epochs.current();
  final db = await ref.watch(databaseProvider.future);
  return AccountContextRepository(
    ref.watch(apiClientProvider),
    db,
    currentEpoch: epochs.read,
  ).load(epoch);
});

/// Générateur d'identifiants des nouvelles dépenses (UUID v7, invariant 5).
final idGeneratorProvider = Provider<String Function()>(
  (ref) => const Uuid().v7,
);

/// Données de l'écran de saisie : contexte, catégories, dernière catégorie utilisée.
class QuickEntryData {
  const QuickEntryData(this.account, this.categories, this.lastCategoryId);

  final AccountContext account;
  final List<Category> categories;
  final String? lastCategoryId;
}

final quickEntryDataProvider = FutureProvider.autoDispose<QuickEntryData>(
  retry: _noRetry,
  (ref) async {
    final account = await ref.watch(accountContextProvider.future);
    final db = await ref.watch(databaseProvider.future);
    final categories = await db.selectableCategories(account.notebookId);
    final last = await db.readMeta(quickEntryLastCategoryKey);
    return QuickEntryData(
      account,
      categories,
      categories.any((c) => c.id == last) ? last : null,
    );
  },
);

Duration? _noRetry(int retryCount, Object error) => null;
