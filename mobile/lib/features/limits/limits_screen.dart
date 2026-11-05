import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates/date_display.dart';
import '../../core/limits/limit_api.dart';
import '../../core/limits/limit_models.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import 'limit_form.dart';
import 'limit_providers.dart';

/// Limite globale (F-LIM-01/02/03/05/09, ADR-053) : jauge de la période en
/// cours lue depuis l'API, puis réglages. En ligne seulement.
class LimitsScreen extends ConsumerWidget {
  const LimitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final overview = ref.watch(limitOverviewProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.limitsTitle)),
      body: switch (overview) {
        // Contenu gardé pendant le rechargement qui suit un enregistrement.
        AsyncValue(:final value?) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Rechargement en échec : la jauge affichée n'est plus à jour.
            if (overview.hasError) ...[
              Text(
                l10n.limitOffline,
                key: const Key('limit-stale'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              TextButton(
                onPressed: () => ref.invalidate(limitOverviewProvider),
                child: Text(l10n.retry),
              ),
            ],
            LimitSummaryCard(summary: value.overview.current),
            const SizedBox(height: 24),
            LimitForm(
              // Nouveau formulaire (et nouvel identifiant) après chaque
              // version enregistrée.
              key: ValueKey(value.overview.last?.updatedAt),
              data: value,
              // Réglages peut-être périmés : un enregistrement pourrait
              // rejouer une création déjà faite et perdre la saisie.
              enabled: !overview.hasError,
            ),
          ],
        ),
        AsyncError() => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.limitOffline, key: const Key('limit-offline')),
              TextButton(
                key: const Key('limit-retry'),
                onPressed: () => ref.invalidate(limitOverviewProvider),
                child: Text(l10n.retry),
              ),
            ],
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

/// Dépensé, restant et rythme de la période en cours (F-LIM-03), tels que
/// calculés par l'API.
class LimitSummaryCard extends StatelessWidget {
  const LimitSummaryCard({super.key, required this.summary});

  final PeriodSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final text = Theme.of(context).textTheme;
    String money(int minor) => formatAmount(minor, summary.currency, locale);
    final s = summary;
    return Card(
      key: const Key('limit-summary'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 8,
          children: [
            Text(l10n.limitCurrentTitle, style: text.titleMedium),
            Text(
              l10n.limitPeriod(
                formatCalendarDate(s.start, locale),
                formatCalendarDate(s.end, locale),
              ),
              style: text.bodySmall,
            ),
            if (s.limit case final limit?) ...[
              Text(
                l10n.limitSpentOf(money(s.spent), money(limit)),
                key: const Key('limit-spent'),
                style: text.titleLarge,
              ),
              if (s.consumedPercent case final consumed?)
                LinearProgressIndicator(
                  value: (consumed.clamp(0, 100)) / 100,
                  // Libellé lu avec le pourcentage, plafonné à 100 % par
                  // Flutter : le dépassement vient du texte voisin, fusionné
                  // dans le même nœud sémantique (testé dans
                  // test/a11y/guidelines_test.dart ; ne pas isoler la jauge).
                  semanticsLabel: l10n.limitGaugeLabel,
                  color: consumed >= 100
                      ? Theme.of(context).colorScheme.error
                      : null,
                ),
              if (s.remaining case final remaining?)
                Text(
                  remaining < 0
                      ? l10n.limitExceeded(money(-remaining))
                      : l10n.limitRemaining(money(remaining)),
                  key: const Key('limit-remaining'),
                ),
              if (s.consumedPercent case final consumed?)
                Text(switch (s.periodKind) {
                  LimitPeriodKind.month => l10n.limitPaceMonth(
                    consumed,
                    s.elapsedPercent,
                  ),
                  LimitPeriodKind.week => l10n.limitPaceWeek(
                    consumed,
                    s.elapsedPercent,
                  ),
                }, key: const Key('limit-pace')),
            ] else ...[
              Text(l10n.limitNone, key: const Key('limit-none')),
              Text(
                l10n.limitSpentNoLimit(money(s.spent)),
                key: const Key('limit-spent'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String limitMessage(AppLocalizations l10n, LimitFailure failure) =>
    switch (failure) {
      LimitFailure.offline => l10n.limitOffline,
      LimitFailure.invalid => l10n.limitInvalid,
      LimitFailure.conflict => l10n.limitConflict,
    };
