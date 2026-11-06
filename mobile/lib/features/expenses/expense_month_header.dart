import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates/date_display.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/tokens.dart';
import 'expense_filter_sheet.dart';
import 'expense_providers.dart';

/// Sélecteur de mois de la liste (P8-05) ; quand les filtres fixent une
/// période, il l'affiche à la place et masque les flèches (ADR-070).
class ExpenseMonthHeader extends ConsumerWidget {
  const ExpenseMonthHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final filter = ref.watch(expenseFilterProvider);
    final month = ref.watch(expenseMonthProvider).value;
    final label = filter.hasPeriod
        ? filterPeriodLabel(l10n, locale, filter.from, filter.to)
        : month == null
        ? ''
        : formatCalendarMonth(month, locale);
    void shift(int delta) =>
        ref.read(expenseMonthOffsetProvider.notifier).shift(delta);

    Widget arrow(String key, IconData icon, String tooltip, int delta) =>
        IconButton(
          key: Key(key),
          tooltip: tooltip,
          style: IconButton.styleFrom(
            backgroundColor: t.surfaceHigh,
            foregroundColor: t.text,
          ),
          icon: Icon(icon),
          onPressed: () => shift(delta),
        );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      child: Row(
        children: [
          if (!filter.hasPeriod)
            arrow(
              'month-previous',
              Icons.chevron_left_rounded,
              l10n.expensePreviousMonth,
              -1,
            ),
          Expanded(
            child: Semantics(
              liveRegion: label.isNotEmpty,
              child: Text(
                label,
                key: const Key('expense-month'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: t.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          if (!filter.hasPeriod)
            arrow(
              'month-next',
              Icons.chevron_right_rounded,
              l10n.expenseNextMonth,
              1,
            ),
        ],
      ),
    );
  }
}
