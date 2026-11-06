import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;
import 'package:uuid/uuid.dart';

import '../../core/account/account_context.dart';
import '../../core/dates/date_display.dart';
import '../../core/dates/today.dart';
import '../../core/db/app_database.dart';
import '../../core/db/expense_filter.dart';
import '../../core/db/expense_store.dart';
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

/// Données de l'écran de saisie : contexte, catégories, dernière catégorie
/// utilisée ; [expense] = dépense modifiée (`null` en création).
class QuickEntryData {
  const QuickEntryData(
    this.account,
    this.categories,
    this.lastCategoryId, {
    this.expense,
  });

  final AccountContext account;
  final List<Category> categories;
  final String? lastCategoryId;
  final Expense? expense;
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

/// Dépense à modifier (P6-06) ; erreur [ExpenseNotFound] si elle n'existe pas
/// (ou plus) dans le carnet courant. Sa catégorie reste proposée même masquée.
final expenseEditDataProvider = FutureProvider.autoDispose
    .family<QuickEntryData, String>(retry: _noRetry, (ref, id) async {
      final account = await ref.watch(accountContextProvider.future);
      final db = await ref.watch(databaseProvider.future);
      final expense = await db.expenseById(id);
      if (expense == null ||
          expense.notebookId != account.notebookId ||
          expense.deletedAt != null) {
        throw const ExpenseNotFound();
      }
      final categories = await db.selectableCategories(account.notebookId);
      if (!categories.any((c) => c.id == expense.categoryId)) {
        final current = await (db.select(
          db.categories,
        )..where((c) => c.id.equals(expense.categoryId))).getSingleOrNull();
        if (current != null) categories.add(current);
      }
      return QuickEntryData(
        account,
        categories,
        expense.categoryId,
        expense: expense,
      );
    });

class ExpenseNotFound implements Exception {
  const ExpenseNotFound();
}

/// Dépense de la copie locale, avec sa catégorie (`null` si la catégorie
/// n'est pas encore synchronisée).
class LocalExpenseItem {
  const LocalExpenseItem(this.expense, this.category);

  final Expense expense;
  final Category? category;
}

/// Dernières dépenses du carnet, lues dans la base locale : consultables hors
/// connexion (NF-OFF-01). Rafraîchie après chaque saisie et chaque synchro.
final localExpensesProvider =
    FutureProvider.autoDispose<List<LocalExpenseItem>>(retry: _noRetry, (
      ref,
    ) async {
      final account = await ref.watch(accountContextProvider.future);
      final db = await ref.watch(databaseProvider.future);
      return [
        for (final (e, c) in await db.recentExpenses(account.notebookId))
          LocalExpenseItem(e, c),
      ];
    });

/// Critères de l'écran de liste (F-DEP-09), réinitialisés à sa fermeture.
final expenseFilterProvider =
    NotifierProvider.autoDispose<ExpenseFilterController, ExpenseFilter>(
      ExpenseFilterController.new,
    );

class ExpenseFilterController extends Notifier<ExpenseFilter> {
  @override
  ExpenseFilter build() => const ExpenseFilter();

  void setText(String text) => state = state.withText(text);

  void setCriteria(ExpenseFilter criteria) =>
      state = state.withCriteriaOf(criteria);
}

/// Décalage en mois du sélecteur de la liste (0 = mois courant), conservé
/// tant que l'onglet reste monté.
final expenseMonthOffsetProvider =
    NotifierProvider.autoDispose<MonthOffsetController, int>(
      MonthOffsetController.new,
    );

class MonthOffsetController extends Notifier<int> {
  @override
  int build() => 0;

  void shift(int delta) => state += delta;
}

/// Mois `AAAA-MM` affiché par la liste : mois courant dans le fuseau du
/// compte, décalé par le sélecteur. Ignoré quand les filtres fixent une
/// période (ADR-070).
final expenseMonthProvider = FutureProvider.autoDispose<String>(
  retry: _noRetry,
  (ref) async {
    final offset = ref.watch(expenseMonthOffsetProvider);
    final account = await ref.watch(accountContextProvider.future);
    final today = todayIn(account.timeZone, ref.read(clockProvider)());
    return shiftMonth(monthOf(today), offset);
  },
);

/// Catégories proposées dans les filtres (masquées comprises).
final filterCategoriesProvider = FutureProvider.autoDispose<List<Category>>(
  retry: _noRetry,
  (ref) async {
    final account = await ref.watch(accountContextProvider.future);
    final db = await ref.watch(databaseProvider.future);
    return db.filterableCategories(account.notebookId);
  },
);

/// Résultats de la recherche locale (consultable hors connexion), rafraîchis
/// après chaque modification et chaque synchro.
final expenseSearchProvider =
    FutureProvider.autoDispose<List<LocalExpenseItem>>(retry: _noRetry, (
      ref,
    ) async {
      final filter = ref.watch(expenseFilterProvider);
      final month = await ref.watch(expenseMonthProvider.future);
      final account = await ref.watch(accountContextProvider.future);
      final db = await ref.watch(databaseProvider.future);
      return [
        for (final (e, c) in await db.searchExpenses(
          account.notebookId,
          filter.hasPeriod ? filter : filter.withPeriod(monthBounds(month)),
        ))
          LocalExpenseItem(e, c),
      ];
    });

/// À appeler après toute écriture locale sur les dépenses
/// (`refreshLocalExpenses(ref.invalidate)`).
void refreshLocalExpenses(void Function(ProviderOrFamily) invalidate) {
  invalidate(localExpensesProvider);
  invalidate(expenseSearchProvider);
}

Duration? _noRetry(int retryCount, Object error) => null;
