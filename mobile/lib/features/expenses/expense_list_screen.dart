import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/expense_filter.dart';
import '../../l10n/generated/app_localizations.dart';
import '../shell/account_avatar.dart';
import 'expense_filter_sheet.dart';
import 'expense_providers.dart';
import 'expense_tile.dart';

/// Liste des dépenses de la copie locale avec recherche et filtres
/// combinables (F-DEP-09), consultable hors connexion (NF-OFF-01).
class ExpenseListScreen extends ConsumerWidget {
  const ExpenseListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final filter = ref.watch(expenseFilterProvider);
    final results = ref.watch(expenseSearchProvider);
    final items = visibleExpenses(ref, results.value ?? const []);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.expenseListTitle),
        actions: [
          IconButton(
            key: const Key('open-filters'),
            tooltip: l10n.filtersTitle,
            isSelected: filter.hasCriteria,
            icon: const Icon(Icons.filter_list_rounded),
            selectedIcon: const Icon(Icons.filter_alt_rounded),
            onPressed: () => showExpenseFilterSheet(context, ref),
          ),
          const AccountAvatarButton(),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              key: const Key('expense-search'),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                labelText: l10n.searchLabel,
                helperText: l10n.searchHint,
              ),
              textInputAction: TextInputAction.search,
              onChanged: ref.read(expenseFilterProvider.notifier).setText,
            ),
          ),
          if (filter.hasCriteria)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
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
                    child: Text(
                      filter.isEmpty ? l10n.homeEmpty : l10n.searchEmpty,
                      key: const Key('expense-search-empty'),
                    ),
                  )
                : ListView.builder(
                    key: const Key('expense-results'),
                    itemCount: items.length,
                    itemBuilder: (context, i) => ExpenseTile(item: items[i]),
                  ),
          ),
        ],
      ),
    );
  }
}
