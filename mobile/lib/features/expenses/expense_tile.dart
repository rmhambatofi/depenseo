import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/amount_text.dart';
import '../../ui/icon_tile.dart';
import '../../ui/tokens.dart';
import '../categories/category_badge.dart';
import '../sync/sync_controller.dart';
import 'expense_providers.dart';
import 'pending_deletions.dart';
import 'quick_entry_screen.dart';

/// Tuile de dépense (accueil et liste, P8-05) : tuile de catégorie,
/// catégorie, commerçant · note, montant et date ; un appui ouvre la
/// modification. Lue d'un bloc par les lecteurs d'écran.
class ExpenseTile extends ConsumerWidget {
  const ExpenseTile({super.key, required this.item});

  final LocalExpenseItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final e = item.expense;
    final category = item.category;
    final status = e.syncError == 'conflict'
        ? (Icons.sync_problem_rounded, l10n.expenseSyncConflict)
        : e.syncError != null
        ? (Icons.error_outline_rounded, l10n.expenseSyncRejected)
        : e.pendingSync
        ? (Icons.cloud_upload_rounded, l10n.expensePendingSync)
        : null;
    final details = [
      if (e.merchant != null && e.merchant!.trim().isNotEmpty) e.merchant!,
      if (e.note != null && e.note!.trim().isNotEmpty) e.note!,
    ].join(' · ');
    final muted = TextStyle(color: t.textMuted, fontSize: 13);
    return MergeSemantics(
      key: Key('expense-${e.id}'),
      // Annoncée comme bouton, comme l'ancienne `ListTile`.
      child: Semantics(
        button: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.tile),
          onTap: () => openExpense(context, ref, e.id),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                category == null
                    ? IconTile(icon: Icons.category_rounded, color: t.textMuted)
                    : CategoryIconBadge(
                        icon: category.icon,
                        color: category.color,
                        faded: category.hidden,
                        size: 48,
                      ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category?.name ?? l10n.categoryNotSynced,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: t.text,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (details.isNotEmpty)
                        Text(
                          details,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: muted,
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                // Flexible : en texte agrandi, le montant se réduit au lieu de
                // déborder (FittedBox) et la date se coupe.
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (status != null)
                              Padding(
                                padding: const EdgeInsetsDirectional.only(
                                  end: 4,
                                ),
                                child: Icon(
                                  status.$1,
                                  size: 16,
                                  color: t.textMuted,
                                  semanticLabel: status.$2,
                                ),
                              ),
                            AmountText(
                              formatAmount(e.amount, e.currency, locale),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        formatCalendarDate(e.date, locale),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: muted,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
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
