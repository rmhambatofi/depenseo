import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import '../auth/auth_controller.dart';
import '../expenses/expense_providers.dart';
import '../expenses/expense_tile.dart';
import '../sync/sync_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    // Prépare le contexte du compte avant le premier « + » (saisie en < 10 s).
    ref.watch(accountContextProvider);
    final sync = ref.watch(syncControllerProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.homeTitle),
        actions: [
          if (sync == SyncPhase.offline)
            Tooltip(
              message: l10n.syncOffline,
              child: const Padding(
                key: Key('sync-offline'),
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.cloud_off_outlined),
              ),
            ),
          IconButton(
            key: const Key('open-expenses'),
            tooltip: l10n.expenseListTitle,
            icon: const Icon(Icons.search),
            onPressed: () => context.push('/expenses'),
          ),
          IconButton(
            key: const Key('open-settings'),
            tooltip: l10n.settingsTitle,
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
          IconButton(
            tooltip: l10n.logout,
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: const _RecentExpenses(),
      // « + » toujours visible sur l'accueil (F-DEP-01).
      floatingActionButton: FloatingActionButton(
        key: const Key('add-expense'),
        tooltip: l10n.addExpense,
        onPressed: () async {
          // Préchargement échoué (hors ligne au lancement) : nouvel essai.
          if (ref.read(accountContextProvider).hasError) {
            ref.invalidate(accountContextProvider);
          }
          final saved = await context.push<bool>('/expenses/new');
          if (saved == true) {
            refreshLocalExpenses(ref.invalidate);
            ref.read(syncControllerProvider.notifier).request().ignore();
          }
          if (saved == true && context.mounted) {
            ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(SnackBar(content: Text(l10n.expenseSaved)));
          }
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}

/// Dernières dépenses de la copie locale : consultables hors connexion.
class _RecentExpenses extends ConsumerWidget {
  const _RecentExpenses();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final items = visibleExpenses(
      ref,
      ref.watch(localExpensesProvider).value ?? const [],
    );
    if (items.isEmpty) return Center(child: Text(l10n.homeEmpty));
    return ListView.builder(
      key: const Key('recent-expenses'),
      itemCount: items.length,
      itemBuilder: (context, i) => ExpenseTile(item: items[i]),
    );
  }
}
