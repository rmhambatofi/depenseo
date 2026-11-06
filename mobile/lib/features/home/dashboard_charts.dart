import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dashboard/dashboard_api.dart';
import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/app_card.dart';
import '../../ui/icon_tile.dart';
import '../../ui/section_header.dart';
import '../../ui/tokens.dart';
import '../categories/category_badge.dart';
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

  /// Titre hors de la carte (charte P8, annoncé comme en-tête), carte de la
  /// charte dessous.
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionHeader(title: title),
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: AppSpacing.sm,
          children: children,
        ),
      ),
    ],
  );
}

/// « Où va votre argent ? » : anneau + liste de catégories racines en tuiles
/// (nom, montant, part en % lue dans l'API).
class CategoryBreakdown extends ConsumerWidget {
  const CategoryBreakdown({super.key, required this.dashboard});

  final Dashboard dashboard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final labels = ref.watch(categoryLabelsProvider);
    final t = AppTokens.of(context);
    final currency = dashboard.gauge.currency;
    final shares = [
      for (final s in dashboard.categories)
        (
          share: s,
          category: labels[s.categoryId],
          name: labels[s.categoryId]?.name ?? l10n.dashboardCategoryUnknown,
          color: switch (labels[s.categoryId]) {
            final c? => parseCategoryColor(c.color),
            null => t.textMuted,
          },
        ),
    ];
    return _ChartCard(
      key: const Key('dashboard-categories'),
      title: l10n.dashboardCategoriesTitle,
      children: [
        if (shares.isEmpty)
          Text(
            l10n.dashboardCategoriesEmpty,
            style: TextStyle(color: t.textMuted),
          )
        else ...[
          ExcludeSemantics(
            child: SizedBox(
              height: 180,
              child: PieChart(
                PieChartData(
                  centerSpaceRadius: 52,
                  sectionsSpace: 3,
                  pieTouchData: PieTouchData(enabled: false),
                  sections: [
                    for (final s in shares)
                      PieChartSectionData(
                        value: s.share.total.toDouble(),
                        color: s.color,
                        radius: 26,
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
              spacing: AppSpacing.sm,
              children: [
                switch (s.category) {
                  final c? => CategoryIconBadge(icon: c.icon, color: c.color),
                  null => IconTile(
                    icon: Icons.help_outline_rounded,
                    color: t.textMuted,
                    size: 40,
                  ),
                },
                Expanded(
                  child: Text(
                    s.name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                // Texte agrandi : le montant passe à la ligne au lieu de
                // déborder (NF-QUA-04).
                Flexible(
                  child: Text(
                    l10n.dashboardCategoryShare(
                      formatAmount(s.share.total, currency, locale),
                      s.share.percent,
                    ),
                    textAlign: TextAlign.end,
                    style: const TextStyle(
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
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
    final t = AppTokens.of(context);
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
      isCurved: true,
      preventCurveOverShooting: true,
      isStrokeCapRound: true,
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
                    line(dashboard.previous, t.textMuted, dashArray: [6, 4]),
                  line(dashboard.current, t.primary),
                ],
              ),
            ),
          ),
        ),
        Wrap(
          spacing: 16,
          children: [
            _Legend(color: t.primary, label: l10n.dashboardCurrentPeriod),
            _Legend(color: t.textMuted, label: l10n.dashboardPreviousPeriod),
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
    final t = AppTokens.of(context);
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
                          width: 14,
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(7),
                          ),
                          // Période en cours en couleur primaire, les autres
                          // en gris contrasté (≥ 3:1) ; aussi signalée en
                          // texte.
                          color: i == periods.length - 1
                              ? t.primary
                              : t.textMuted,
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
          style: TextStyle(color: t.textMuted, fontSize: 13),
        ),
      ],
    );
  }
}
