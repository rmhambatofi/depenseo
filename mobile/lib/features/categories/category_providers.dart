import 'package:flutter/foundation.dart' show FlutterError, FlutterErrorDetails;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;

import '../../core/categories/category_api.dart';
import '../../core/db/app_database.dart';
import '../../core/db/category_store.dart';
import '../../providers.dart';
import '../expenses/expense_providers.dart';
import '../sync/sync_controller.dart';

final categoryApiProvider = Provider<CategoryApi>(
  (ref) => CategoryApi(ref.watch(apiClientProvider)),
);

/// Arbre des catégories du carnet (masquées comprises), lu localement :
/// consultable hors connexion, rafraîchi après chaque synchro.
final categoryTreeProvider = FutureProvider.autoDispose<List<CategoryNode>>(
  retry: _noRetry,
  (ref) async {
    final account = await ref.watch(accountContextProvider.future);
    final db = await ref.watch(databaseProvider.future);
    return db.categoryTree(account.notebookId);
  },
);

/// Écran de modification : catégorie modifiée (`null` en création) et
/// racines proposées comme parent.
class CategoryEditData {
  const CategoryEditData(this.category, this.roots);

  final Category? category;
  final List<Category> roots;
}

/// Lu une fois (pas de dépendance à [categoryTreeProvider]) : une synchro ne
/// doit pas réinitialiser le formulaire ouvert.
final categoryEditDataProvider = FutureProvider.autoDispose
    .family<CategoryEditData, String?>(retry: _noRetry, (ref, id) async {
      final account = await ref.watch(accountContextProvider.future);
      final db = await ref.watch(databaseProvider.future);
      final tree = await db.categoryTree(account.notebookId);
      final all = [
        for (final node in tree) ...[node.category, ...node.children],
      ];
      final category = id == null
          ? null
          : all.where((c) => c.id == id).firstOrNull;
      if (id != null && category == null) {
        throw const CategoryWriteError(CategoryWriteFailure.gone);
      }
      return CategoryEditData(category, [for (final n in tree) n.category]);
    });

/// Écrit une catégorie par l'API (en ligne seulement, ADR-052), reprend la
/// réponse dans la base locale puis demande une synchro, qui apportera la
/// ligne complète. Lève [CategoryWriteError] en cas d'échec.
Future<void> writeCategory(
  WidgetRef ref,
  Future<Map<String, dynamic>> Function(CategoryApi api, String notebookId)
  write,
) async {
  final epochs = ref.read(accountEpochProvider);
  final String notebookId;
  final Map<String, dynamic> remote;
  String? epoch;
  try {
    epoch = await epochs.read();
    if (epoch == null) {
      throw const CategoryWriteError(CategoryWriteFailure.offline);
    }
    notebookId = (await ref.read(accountContextProvider.future)).notebookId;
    remote = await write(ref.read(categoryApiProvider), notebookId);
    // Déconnexion ou autre compte pendant la requête : rien n'est écrit.
    if (await epochs.read() != epoch) {
      throw const CategoryWriteError(CategoryWriteFailure.offline);
    }
  } on CategoryWriteError {
    // Réponse (404…) obtenue sous une autre session : pas un verdict.
    if (epoch != null && await epochs.read() != epoch) {
      throw const CategoryWriteError(CategoryWriteFailure.offline);
    }
    rethrow;
  } on Object {
    // Session expirée (401, déjà déconnectée) ou contexte indisponible.
    throw const CategoryWriteError(CategoryWriteFailure.offline);
  }
  // Le serveur a enregistré : un échec local ne doit pas faire croire le
  // contraire ; la synchro demandée ci-dessous apportera la ligne.
  try {
    final db = await ref.read(databaseProvider.future);
    await db.storeCategoryFromApi(
      notebookId,
      remote,
      ref.read(clockProvider)(),
    );
  } on Object catch (e, stack) {
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: e.runtimeType,
        stack: stack,
        library: 'depenseo categories',
      ),
    );
  }
  refreshCategories(ref.invalidate);
  ref.read(syncControllerProvider.notifier).request().ignore();
}

/// À appeler après toute écriture locale des catégories.
void refreshCategories(void Function(ProviderOrFamily) invalidate) {
  invalidate(categoryTreeProvider);
  invalidate(filterCategoriesProvider);
}

Duration? _noRetry(int retryCount, Object error) => null;
