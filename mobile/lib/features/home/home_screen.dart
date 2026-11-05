import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../auth/auth_controller.dart';
import '../expenses/expense_providers.dart';
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
            ref.invalidate(localExpensesProvider);
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
    final locale = Localizations.localeOf(context).toLanguageTag();
    final items = ref.watch(localExpensesProvider).value ?? const [];
    if (items.isEmpty) return Center(child: Text(l10n.homeEmpty));
    return ListView.builder(
      key: const Key('recent-expenses'),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        final e = item.expense;
        final status = e.syncError == 'conflict'
            ? (Icons.sync_problem_outlined, l10n.expenseSyncConflict)
            : e.syncError != null
            ? (Icons.error_outline, l10n.expenseSyncRejected)
            : e.pendingSync
            ? (Icons.cloud_upload_outlined, l10n.expensePendingSync)
            : null;
        return ListTile(
          key: Key('expense-${e.id}'),
          title: Text(item.categoryName ?? l10n.categoryNotSynced),
          subtitle: Text(
            [
              _formatDate(e.date, locale),
              if (e.merchant != null) e.merchant!,
            ].join(' · '),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (status != null)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: Icon(status.$1, size: 18, semanticLabel: status.$2),
                ),
              Text(formatAmount(e.amount, e.currency, locale)),
            ],
          ),
        );
      },
    );
  }
}

/// Date calendaire `AAAA-MM-JJ` affichée telle quelle, sans fuseau.
String _formatDate(String date, String locale) {
  final [y, m, d] = date.split('-').map(int.parse).toList();
  return DateFormat.yMMMd(locale).format(DateTime.utc(y, m, d));
}
