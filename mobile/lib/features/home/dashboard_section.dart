import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dashboard/dashboard_api.dart';
import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/amount_text.dart';
import '../../ui/app_card.dart';
import '../../ui/icon_tile.dart';
import '../../ui/section_header.dart';
import '../../ui/tokens.dart';
import '../shell/app_shell.dart' show AppTab, openTab;
import 'dashboard_charts.dart';
import 'dashboard_providers.dart';
import 'home_header.dart';

/// Haut de l'accueil (F-TB-01/02, ADR-055, P8-04) : carte d'en-tête,
/// prochaines échéances et graphiques, tels que renvoyés par
/// `GET …/dashboard`.
class DashboardSection extends ConsumerWidget {
  const DashboardSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final dashboard = ref.watch(dashboardProvider);
    final offline = [
      Text(
        l10n.dashboardOffline,
        key: const Key('dashboard-offline'),
        style: TextStyle(color: AppTokens.of(context).danger),
      ),
      TextButton(
        key: const Key('dashboard-retry'),
        onPressed: () => ref.invalidate(dashboardProvider),
        child: Text(l10n.retry),
      ),
    ];
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: switch (dashboard) {
        // Réponse précédente gardée pendant un rechargement ou après son échec.
        AsyncValue(:final value?) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Copie locale ou rechargement en échec : peut-être périmé.
            if (value.stale || dashboard.hasError) ...offline,
            HomeHeaderCard(dashboard: value.dashboard),
            _UpcomingCard(dashboard: value.dashboard),
            CategoryBreakdown(dashboard: value.dashboard),
            CumulativeChart(dashboard: value.dashboard),
            EvolutionChart(dashboard: value.dashboard),
          ],
        ),
        AsyncError() => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: offline,
        ),
        // Pas d'indicateur animé : l'accueil reste utilisable (« + ») et la
        // liste locale s'affiche aussitôt.
        _ => const SizedBox.shrink(),
      },
    );
  }
}

class _UpcomingCard extends ConsumerWidget {
  const _UpcomingCard({required this.dashboard});

  final Dashboard dashboard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final t = AppTokens.of(context);
    return Column(
      key: const Key('dashboard-upcoming'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: l10n.dashboardUpcomingTitle),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (dashboard.upcoming.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Text(
                    l10n.dashboardUpcomingEmpty,
                    style: TextStyle(color: t.textMuted),
                  ),
                ),
              for (final u in dashboard.upcoming)
                ListTile(
                  key: Key('upcoming-${u.occurrence.id}'),
                  leading: IconTile(
                    icon: u.overdue
                        ? Icons.event_busy_rounded
                        : Icons.event_repeat_rounded,
                    color: u.overdue ? t.danger : t.primary,
                    size: 44,
                  ),
                  title: Text(u.occurrence.name),
                  subtitle: Text(
                    u.overdue
                        ? '${formatCalendarDate(u.occurrence.dueDate, locale)}'
                              ' · ${l10n.dashboardOverdue}'
                        : formatCalendarDate(u.occurrence.dueDate, locale),
                    style: TextStyle(color: u.overdue ? t.danger : t.textMuted),
                  ),
                  trailing: AmountText(
                    formatAmount(
                      u.occurrence.amount,
                      u.occurrence.currency,
                      locale,
                    ),
                  ),
                  // Payer ou passer l'échéance : onglet des récurrences.
                  onTap: () => openTab(
                    ref,
                    StatefulNavigationShell.of(context).widget,
                    AppTab.recurring,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
