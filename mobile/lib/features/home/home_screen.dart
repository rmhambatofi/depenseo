import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../auth/auth_controller.dart';
import '../expenses/expense_providers.dart';
import '../expenses/expense_tile.dart';
import '../shell/account_avatar.dart';
import '../sync/sync_controller.dart';
import 'dashboard_section.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
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
                child: Icon(Icons.cloud_off_rounded),
              ),
            ),
          IconButton(
            tooltip: l10n.logout,
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
          const AccountAvatarButton(),
        ],
      ),
      body: const _HomeBody(),
    );
  }
}

/// Indicateurs de la période (en ligne) puis dernières dépenses de la copie
/// locale (consultables hors connexion, saisies non synchronisées comprises).
class _HomeBody extends ConsumerWidget {
  const _HomeBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final items = visibleExpenses(
      ref,
      ref.watch(localExpensesProvider).value ?? const [],
    );
    return ListView(
      key: const Key('recent-expenses'),
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        const DashboardSection(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Text(
            l10n.dashboardRecentTitle,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(l10n.homeEmpty),
          ),
        for (final item in items) ExpenseTile(item: item),
      ],
    );
  }
}
