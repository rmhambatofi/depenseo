import 'package:flutter/material.dart';

import '../../core/dashboard/dashboard_api.dart';
import '../../core/dates/date_display.dart';
import '../../core/limits/limit_models.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/amount_text.dart';
import '../../ui/tokens.dart';

/// Carte d'en-tête de l'accueil (F-TB-01, P8-04, ADR-069) : dépensé de la
/// période en grand, puis limite, reste et rythme, tels que renvoyés par
/// `GET …/dashboard`. Le sélecteur parcourt les 12 périodes de `evolution`
/// (la dernière = période en cours, lue dans `gauge`) : aucune période ni
/// aucun montant n'est calculé sur le téléphone (invariant 8).
///
/// Contraste : texte blanc ≥ 4,5:1 jusqu'au milieu du dégradé seulement
/// (`test/ui/tokens_test.dart`) ; les petits libellés restent en haut à
/// gauche (départ), les grands montants et les icônes peuvent aller plus loin.
class HomeHeaderCard extends StatefulWidget {
  const HomeHeaderCard({super.key, required this.dashboard});

  final Dashboard dashboard;

  @override
  State<HomeHeaderCard> createState() => _HomeHeaderCardState();
}

class _HomeHeaderCardState extends State<HomeHeaderCard> {
  /// Nombre de périodes avant la période en cours (0 : en cours) ; gardé
  /// quand le tableau de bord est relu, remis à 0 si la période en cours a
  /// changé (sinon le même décalage montrerait une autre période).
  int _back = 0;

  @override
  void didUpdateWidget(HomeHeaderCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.dashboard.gauge.start != widget.dashboard.gauge.start) {
      _back = 0;
    }
  }

  List<PeriodSummary> get _periods {
    final d = widget.dashboard;
    if (d.evolution.isEmpty) return [d.gauge];
    return [...d.evolution.take(d.evolution.length - 1), d.gauge];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final t = AppTokens.of(context);
    final periods = _periods;
    final back = _back.clamp(0, periods.length - 1);
    final s = periods[periods.length - 1 - back];
    final small = TextStyle(
      color: t.onGradient,
      fontSize: 14,
      fontWeight: FontWeight.w500,
    );
    // Conteneur sémantique : la carte n'est pas fusionnée avec les sections
    // suivantes de l'accueil.
    return Semantics(
      container: true,
      child: Container(
        key: const Key('limit-summary'),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          gradient: t.primaryGradient,
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: Stack(
          children: [
            // Cercles décoratifs, côté arrivée (aucun petit libellé dessous :
            // le voile blanc abaisse le contraste).
            _Circle(right: -70, top: -90, size: 160, color: t.onGradient),
            _Circle(right: 40, bottom: -70, size: 120, color: t.onGradient),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md + 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Un seul nœud « Dépensé, période, montant », annoncé à
                      // chaque changement de période ; boutons hors fusion.
                      Expanded(
                        child: MergeSemantics(
                          key: const Key('home-spent'),
                          child: Semantics(
                            header: true,
                            liveRegion: true,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 4,
                              children: [
                                Text(l10n.homeSpentLabel, style: small),
                                Text(
                                  l10n.limitPeriod(
                                    formatCalendarDate(s.start, locale),
                                    formatCalendarDate(s.end, locale),
                                  ),
                                  key: const Key('home-period'),
                                  style: small.copyWith(
                                    fontWeight: FontWeight.w400,
                                  ),
                                ),
                                // Réduit plutôt que coupé (texte ×2).
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: AlignmentDirectional.centerStart,
                                  child: AmountText(
                                    formatAmount(s.spent, s.currency, locale),
                                    key: const Key('limit-spent'),
                                    size: AmountSize.hero,
                                    color: t.onGradient,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      _PeriodButton(
                        key: const Key('period-previous'),
                        icon: Icons.chevron_left_rounded,
                        tooltip: l10n.dashboardPreviousPeriod,
                        onPressed: back < periods.length - 1
                            ? () => setState(() => _back = back + 1)
                            : null,
                      ),
                      _PeriodButton(
                        key: const Key('period-next'),
                        icon: Icons.chevron_right_rounded,
                        tooltip: l10n.homeNextPeriod,
                        onPressed: back > 0
                            ? () => setState(() => _back = back - 1)
                            : null,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _LimitPanel(summary: s, current: back == 0),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Circle extends StatelessWidget {
  const _Circle({
    this.top,
    this.right,
    this.bottom,
    required this.size,
    required this.color,
  });

  final double? top;
  final double? right;
  final double? bottom;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Positioned(
    top: top,
    right: right,
    bottom: bottom,
    child: IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: 0.07),
        ),
      ),
    ),
  );
}

class _PeriodButton extends StatelessWidget {
  const _PeriodButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final white = AppTokens.of(context).onGradient;
    return IconButton(
      icon: Icon(icon),
      tooltip: tooltip,
      color: white,
      disabledColor: white.withValues(alpha: 0.4),
      onPressed: onPressed,
    );
  }
}

/// Limite, jauge, reste et rythme sur une surface pleine (contraste des
/// couleurs de la charte, pas du dégradé). Nœud sémantique unique : la jauge
/// est lue avec le texte du dépassement (voir `limits_screen.dart`).
class _LimitPanel extends StatelessWidget {
  const _LimitPanel({required this.summary, required this.current});

  final PeriodSummary summary;

  /// Période en cours : le rythme n'a de sens que pour elle.
  final bool current;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final t = AppTokens.of(context);
    String money(int minor) => formatAmount(minor, summary.currency, locale);
    final s = summary;
    final muted = TextStyle(color: t.textMuted);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm + 2),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(AppRadius.tile),
      ),
      child: MergeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.xs,
          children: [
            if (s.limit case final limit?) ...[
              Text(
                l10n.homeLimitOf(money(limit)),
                key: const Key('limit-amount'),
                style: muted,
              ),
              if (s.consumedPercent case final consumed?)
                LinearProgressIndicator(
                  value: consumed.clamp(0, 100) / 100,
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(4),
                  semanticsLabel: l10n.limitGaugeLabel,
                  color: consumed >= 100 ? t.danger : t.success,
                  backgroundColor: t.surfaceHigh,
                ),
              if (s.remaining case final remaining?)
                Text(
                  remaining < 0
                      ? l10n.limitExceeded(money(-remaining))
                      : l10n.limitRemaining(money(remaining)),
                  key: const Key('limit-remaining'),
                  style: TextStyle(
                    color: remaining < 0 ? t.danger : t.success,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              if (current)
                if (s.consumedPercent case final consumed?)
                  Text(
                    switch (s.periodKind) {
                      LimitPeriodKind.month => l10n.limitPaceMonth(
                        consumed,
                        s.elapsedPercent,
                      ),
                      LimitPeriodKind.week => l10n.limitPaceWeek(
                        consumed,
                        s.elapsedPercent,
                      ),
                    },
                    key: const Key('limit-pace'),
                    style: muted,
                  ),
            ] else
              Text(l10n.limitNone, key: const Key('limit-none'), style: muted),
          ],
        ),
      ),
    );
  }
}
