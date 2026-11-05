import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dashboard/dashboard_api.dart';
import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../limits/limits_screen.dart' show LimitSummaryCard;
import 'dashboard_charts.dart';
import 'dashboard_providers.dart';

/// Haut de l'accueil (F-TB-01/02, ADR-055) : jauge de la période, prochaines
/// échéances et graphiques, tels que renvoyés par `GET …/dashboard`.
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
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
      TextButton(
        key: const Key('dashboard-retry'),
        onPressed: () => ref.invalidate(dashboardProvider),
        child: Text(l10n.retry),
      ),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      child: switch (dashboard) {
        // Réponse précédente gardée pendant un rechargement ou après son échec.
        AsyncValue(:final value?) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Copie locale ou rechargement en échec : peut-être périmé.
            if (value.stale || dashboard.hasError) ...offline,
            LimitSummaryCard(summary: value.dashboard.gauge),
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

class _UpcomingCard extends StatelessWidget {
  const _UpcomingCard({required this.dashboard});

  final Dashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final error = Theme.of(context).colorScheme.error;
    return Card(
      key: const Key('dashboard-upcoming'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Text(
              l10n.dashboardUpcomingTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          if (dashboard.upcoming.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Text(l10n.dashboardUpcomingEmpty),
            ),
          for (final u in dashboard.upcoming)
            ListTile(
              key: Key('upcoming-${u.occurrence.id}'),
              title: Text(u.occurrence.name),
              subtitle: Text(
                u.overdue
                    ? '${formatCalendarDate(u.occurrence.dueDate, locale)}'
                          ' · ${l10n.dashboardOverdue}'
                    : formatCalendarDate(u.occurrence.dueDate, locale),
                style: u.overdue ? TextStyle(color: error) : null,
              ),
              trailing: Text(
                formatAmount(
                  u.occurrence.amount,
                  u.occurrence.currency,
                  locale,
                ),
              ),
              // Payer ou passer l'échéance : écran des récurrences.
              onTap: () => context.push('/settings/recurring'),
            ),
        ],
      ),
    );
  }
}
