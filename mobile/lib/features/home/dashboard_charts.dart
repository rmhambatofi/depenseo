import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dashboard/dashboard_api.dart';
import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import 'dashboard_providers.dart';

// Graphiques de l'accueil (F-TB-02, ADR-055). Les montants ne passent en
// `double` que comme coordonnées de tracé : tout texte affiché ou lu par un
// lecteur d'écran vient de `formatAmount` sur les entiers de l'API. Chaque
// graphique a un équivalent textuel (légende ou résumé) : le canevas
// fl_chart est exclu de l'arbre d'accessibilité.

class _ChartCard extends StatelessWidget {
  const _ChartCard({
    required super.key,
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          ...children,
        ],
      ),
    ),
  );
}

final _hexColor = RegExp(r'^#[0-9a-fA-F]{6}$');

Color _parseColor(String hex, Color fallback) => _hexColor.hasMatch(hex)
    ? Color(0xFF000000 | int.parse(hex.substring(1), radix: 16))
    : fallback;

/// Répartition par catégorie racine : anneau + légende (nom, montant, %).
class CategoryBreakdown extends ConsumerWidget {
  const CategoryBreakdown({super.key, required this.dashboard});

  final Dashboard dashboard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final labels = ref.watch(categoryLabelsProvider);
    final muted = Theme.of(context).colorScheme.outline;
    final currency = dashboard.gauge.currency;
    final shares = [
      for (final s in dashboard.categories)
        (
          share: s,
          name: labels[s.categoryId]?.name ?? l10n.dashboardCategoryUnknown,
          color: switch (labels[s.categoryId]) {
            final c? => _parseColor(c.color, muted),
            null => muted,
          },
        ),
    ];
    return _ChartCard(
      key: const Key('dashboard-categories'),
      title: l10n.dashboardCategoriesTitle,
      children: [
        if (shares.isEmpty)
          Text(l10n.dashboardCategoriesEmpty)
        else ...[
          ExcludeSemantics(
            child: SizedBox(
              height: 160,
              child: PieChart(
                PieChartData(
                  centerSpaceRadius: 40,
                  sectionsSpace: 2,
                  pieTouchData: PieTouchData(enabled: false),
                  sections: [
                    for (final s in shares)
                      PieChartSectionData(
                        value: s.share.total.toDouble(),
                        color: s.color,
                        radius: 36,
                        showTitle: false,
                      ),
                  ],
                ),
              ),
            ),
          ),
          for (final s in shares)
            Row(
              key: Key('category-share-${s.share.categoryId}'),
              spacing: 8,
              children: [
                Icon(Icons.circle, size: 12, color: s.color),
                Expanded(child: Text(s.name)),
                // Texte agrandi : le montant passe à la ligne au lieu de
                // déborder (NF-QUA-04).
                Flexible(
                  child: Text(
                    l10n.dashboardCategoryShare(
                      formatAmount(s.share.total, currency, locale),
                      s.share.percent,
                    ),
                    textAlign: TextAlign.end,
                  ),
                ),
              ],
            ),
        ],
      ],
    );
  }
}

/// Cumul de la période en cours comparé à la précédente, au même rang de
/// jour.
class CumulativeChart extends StatelessWidget {
  const CumulativeChart({super.key, required this.dashboard});

  final Dashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final scheme = Theme.of(context).colorScheme;
    String money(int minor) =>
        formatAmount(minor, dashboard.gauge.currency, locale);
    final current = dashboard.current.lastOrNull?.cumulative ?? 0;
    final previous = dashboard.previousAtSameDay;
    LineChartBarData line(
      List<CumulativePoint> points,
      Color color, {
      List<int>? dashArray,
    }) => LineChartBarData(
      spots: [
        for (final p in points)
          FlSpot(p.day.toDouble(), p.cumulative.toDouble()),
      ],
      color: color,
      barWidth: 3,
      dotData: const FlDotData(show: false),
      dashArray: dashArray,
    );
    return _ChartCard(
      key: const Key('dashboard-cumulative'),
      title: l10n.dashboardCumulativeTitle,
      children: [
        ExcludeSemantics(
          child: SizedBox(
            height: 160,
            child: LineChart(
              LineChartData(
                minY: 0,
                lineTouchData: const LineTouchData(enabled: false),
                titlesData: const FlTitlesData(show: false),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                lineBarsData: [
                  // Autre devise : courbes non comparables, la précédente
                  // n'est pas tracée.
                  if (previous != null)
                    line(dashboard.previous, scheme.outline, dashArray: [6, 4]),
                  line(dashboard.current, scheme.primary),
                ],
              ),
            ),
          ),
        ),
        Wrap(
          spacing: 16,
          children: [
            _Legend(color: scheme.primary, label: l10n.dashboardCurrentPeriod),
            _Legend(color: scheme.outline, label: l10n.dashboardPreviousPeriod),
          ],
        ),
        Text(
          previous == null
              ? l10n.dashboardCumulativeOnly(money(current))
              : l10n.dashboardCumulativeVsPrevious(
                  money(current),
                  money(previous.cumulative),
                ),
          key: const Key('dashboard-cumulative-summary'),
        ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    spacing: 4,
    children: [
      Icon(Icons.horizontal_rule_rounded, color: color),
      Flexible(child: Text(label)),
    ],
  );
}

/// Dépensé sur les 12 dernières périodes (la dernière barre = période en
/// cours) ; le détail est lu par les lecteurs d'écran.
class EvolutionChart extends StatelessWidget {
  const EvolutionChart({super.key, required this.dashboard});

  final Dashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final scheme = Theme.of(context).colorScheme;
    final periods = dashboard.evolution;
    final detail = [
      for (final (i, p) in periods.indexed)
        (i == periods.length - 1
            ? l10n.dashboardEvolutionCurrentItem
            : l10n.dashboardEvolutionItem)(
          formatCalendarDate(p.start, locale),
          formatAmount(p.spent, p.currency, locale),
        ),
    ].join('\n');
    return _ChartCard(
      key: const Key('dashboard-evolution'),
      title: l10n.dashboardEvolutionTitle,
      children: [
        Semantics(
          key: const Key('dashboard-evolution-chart'),
          label: detail,
          excludeSemantics: true,
          child: SizedBox(
            height: 140,
            child: BarChart(
              BarChartData(
                minY: 0,
                barTouchData: BarTouchData(enabled: false),
                titlesData: const FlTitlesData(show: false),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                barGroups: [
                  for (final (i, p) in periods.indexed)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: p.spent.toDouble(),
                          width: 12,
                          // Période en cours pleine, les autres en gris
                          // contrasté (≥ 3:1) ; aussi signalée en texte.
                          color: i == periods.length - 1
                              ? scheme.primary
                              : scheme.outline,
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ),
        Text(
          l10n.dashboardEvolutionRange(
            formatCalendarDate(periods.first.start, locale),
            formatCalendarDate(periods.last.end, locale),
          ),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
