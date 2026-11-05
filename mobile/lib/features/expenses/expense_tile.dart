import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../sync/sync_controller.dart';
import 'expense_providers.dart';
import 'pending_deletions.dart';
import 'quick_entry_screen.dart';

/// Ligne de dépense (accueil et liste) ; un appui ouvre la modification.
class ExpenseTile extends ConsumerWidget {
  const ExpenseTile({super.key, required this.item});

  final LocalExpenseItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final e = item.expense;
    final status = e.syncError == 'conflict'
        ? (Icons.sync_problem_outlined, l10n.expenseSyncConflict)
        : e.syncError != null
        ? (Icons.error_outline, l10n.expenseSyncRejected)
        : e.pendingSync
        ? (Icons.cloud_upload_outlined, l10n.expensePendingSync)
        : null;
    return ListTile(
      key: Key('expense-${e.id}'),
      title: Text(item.categoryName ?? l10n.categoryNotSynced),
      subtitle: Text(
        [
          formatCalendarDate(e.date, locale),
          if (e.merchant != null) e.merchant!,
        ].join(' · '),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (status != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: Icon(status.$1, size: 18, semanticLabel: status.$2),
            ),
          Text(formatAmount(e.amount, e.currency, locale)),
        ],
      ),
      onTap: () => openExpense(context, ref, e.id),
    );
  }
}

/// Retire de [items] les dépenses dont la suppression attend son délai.
List<LocalExpenseItem> visibleExpenses(
  WidgetRef ref,
  List<LocalExpenseItem> items,
) {
  final pending = ref.watch(pendingDeletionsProvider);
  if (pending.isEmpty) return items;
  return [
    for (final i in items)
      if (!pending.contains(i.expense.id)) i,
  ];
}

/// Ouvre la dépense [id] puis applique l'issue de l'écran.
Future<void> openExpense(BuildContext context, WidgetRef ref, String id) async {
  final l10n = AppLocalizations.of(context);
  final outcome = await context.push<ExpenseEditOutcome>('/expenses/$id');
  if (outcome == null || !context.mounted) return;
  if (outcome == ExpenseEditOutcome.deleted) {
    deleteWithUndo(context, ref, id);
    return;
  }
  refreshLocalExpenses(ref.invalidate);
  ref.read(syncControllerProvider.notifier).request().ignore();
  final message = switch (outcome) {
    ExpenseEditOutcome.restored => l10n.expenseRestored,
    ExpenseEditOutcome.discarded => l10n.expenseDiscarded,
    _ => l10n.expenseSaved,
  };
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Date calendaire `AAAA-MM-JJ` affichée telle quelle, sans fuseau.
String formatCalendarDate(String date, String locale) {
  final [y, m, d] = date.split('-').map(int.parse).toList();
  return DateFormat.yMMMd(locale).format(DateTime.utc(y, m, d));
}
