import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates/date_display.dart';
import '../../core/db/expense_filter.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/app_card.dart';
import '../../ui/tokens.dart';
import '../shell/account_avatar.dart';
import 'expense_filter_sheet.dart';
import 'expense_month_header.dart';
import 'expense_providers.dart';
import 'expense_tile.dart';

/// Liste des dépenses de la copie locale (P8-05) : sélecteur de mois,
/// recherche et filtres combinables (F-DEP-09), groupes par jour sans total
/// (invariant 8), consultable hors connexion (NF-OFF-01).
class ExpenseListScreen extends ConsumerWidget {
  const ExpenseListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    final filter = ref.watch(expenseFilterProvider);
    final results = ref.watch(expenseSearchProvider);
    final items = visibleExpenses(ref, results.value ?? const []);
    final month = ref.watch(expenseMonthProvider).value;
    final locale = Localizations.localeOf(context).toLanguageTag();
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.expenseListTitle),
        actions: const [AccountAvatarButton()],
      ),
      body: Column(
        children: [
          const ExpenseMonthHeader(),
          const _SearchBar(),
          if (filter.hasCriteria)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: InputChip(
                  key: const Key('clear-filters'),
                  label: Text(l10n.filtersActive),
                  onDeleted: () => ref
                      .read(expenseFilterProvider.notifier)
                      .setCriteria(const ExpenseFilter()),
                  deleteButtonTooltipMessage: l10n.filtersReset,
                ),
              ),
            ),
          Expanded(
            child: results.hasError
                ? Center(child: Text(l10n.accountUnavailable))
                : items.isEmpty && results.hasValue
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Text(
                        filter.isEmpty
                            ? l10n.expenseMonthEmpty
                            : filter.hasPeriod || month == null
                            ? l10n.searchEmpty
                            : l10n.searchEmptyInMonth(
                                formatCalendarMonth(month, locale),
                              ),
                        key: const Key('expense-search-empty'),
                        textAlign: TextAlign.center,
                        style: TextStyle(color: t.textMuted),
                      ),
                    ),
                  )
                : _DayGroups(items: items),
          ),
        ],
      ),
    );
  }
}

/// Champ de recherche et bouton des filtres, côte à côte.
class _SearchBar extends ConsumerWidget {
  const _SearchBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    final active = ref.watch(
      expenseFilterProvider.select((f) => f.hasCriteria),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        AppSpacing.xs,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: TextField(
              key: const Key('expense-search'),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                labelText: l10n.searchLabel,
                hintText: l10n.searchHint,
              ),
              textInputAction: TextInputAction.search,
              onChanged: ref.read(expenseFilterProvider.notifier).setText,
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          IconButton(
            key: const Key('open-filters'),
            tooltip: l10n.filtersTitle,
            isSelected: active,
            style: IconButton.styleFrom(
              minimumSize: const Size.square(56),
              backgroundColor: active ? t.primary : t.surfaceHigh,
              foregroundColor: active ? t.onPrimary : t.text,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.field),
              ),
            ),
            icon: const Icon(Icons.tune_rounded),
            selectedIcon: const Icon(Icons.filter_alt_rounded),
            onPressed: () => showExpenseFilterSheet(context, ref),
          ),
        ],
      ),
    );
  }
}

/// Dépenses (déjà triées par date décroissante) regroupées par jour : un
/// en-tête de date seule, puis une carte des dépenses du jour.
class _DayGroups extends StatelessWidget {
  const _DayGroups({required this.items});

  final List<LocalExpenseItem> items;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final days = <(String, List<LocalExpenseItem>)>[];
    for (final item in items) {
      final date = item.expense.date;
      if (days.isEmpty || days.last.$1 != date) days.add((date, []));
      days.last.$2.add(item);
    }
    return ListView.builder(
      key: const Key('expense-results'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        AppSpacing.lg,
      ),
      itemCount: days.length,
      itemBuilder: (context, i) {
        final (date, dayItems) = days[i];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xs,
                AppSpacing.md,
                AppSpacing.xs,
                AppSpacing.xs,
              ),
              child: Semantics(
                key: Key('expense-day-$date'),
                header: true,
                child: Text(
                  formatCalendarDate(date, locale, long: true),
                  style: TextStyle(
                    color: t.textMuted,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final item in dayItems) ExpenseTile(item: item),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
