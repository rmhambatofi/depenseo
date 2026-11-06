import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../ui/app_card.dart';
import '../../ui/section_header.dart';
import '../../ui/tokens.dart';
import '../auth/auth_controller.dart';
import '../expenses/expense_providers.dart';
import '../expenses/expense_tile.dart';
import '../shell/account_avatar.dart';
import '../shell/app_shell.dart' show AppTab, openTab;
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

/// Dernières dépenses montrées sur l'accueil ; toutes dans l'onglet
/// Dépenses (« Voir tout »).
const homeRecentCount = 5;

/// Indicateurs de la période (en ligne) puis dernières dépenses de la copie
/// locale (consultables hors connexion, saisies non synchronisées comprises).
class _HomeBody extends ConsumerWidget {
  const _HomeBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    final items = visibleExpenses(
      ref,
      ref.watch(localExpensesProvider).value ?? const [],
    );
    return ListView(
      key: const Key('recent-expenses'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        AppSpacing.lg,
      ),
      children: [
        const DashboardSection(),
        SectionHeader(
          title: l10n.dashboardRecentTitle,
          actionLabel: l10n.homeSeeAll,
          actionKey: const Key('recent-see-all'),
          onAction: () => openTab(
            ref,
            StatefulNavigationShell.of(context).widget,
            AppTab.expenses,
          ),
        ),
        AppCard(
          key: const Key('home-recent'),
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Text(
                    l10n.homeEmpty,
                    style: TextStyle(color: t.textMuted),
                  ),
                ),
              for (final item in items.take(homeRecentCount))
                ExpenseTile(item: item),
            ],
          ),
        ),
      ],
    );
  }
}
