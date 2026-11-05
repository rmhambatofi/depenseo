import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/account/account_context.dart';
import '../../core/db/expense_store.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import 'quick_entry_screen.dart';

/// Dépense en conflit (supprimée ailleurs, ADR-050) : l'utilisateur choisit de
/// la restaurer sur le serveur (`POST …/restore`, la synchro renvoie ensuite
/// sa version par PATCH) ou d'abandonner sa copie locale (ADR-051).
class ExpenseConflictBanner extends ConsumerStatefulWidget {
  const ExpenseConflictBanner({
    super.key,
    required this.account,
    required this.expenseId,
  });

  final AccountContext account;
  final String expenseId;

  @override
  ConsumerState<ExpenseConflictBanner> createState() =>
      _ExpenseConflictBannerState();
}

class _ExpenseConflictBannerState extends ConsumerState<ExpenseConflictBanner> {
  bool _busy = false;

  Future<void> _restore() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final restored = await ref
          .read(apiClientProvider)
          .post<Map<String, dynamic>>(
            '/notebooks/${widget.account.notebookId}'
            '/expenses/${widget.expenseId}/restore',
          );
      final db = await ref.read(databaseProvider.future);
      await db.markExpenseRestored(
        widget.expenseId,
        ref.read(clockProvider)(),
        restored.data!['updatedAt'] as String,
      );
    } on Object {
      // Réseau, 404 (identifiant pris ailleurs, ADR-051) ou écriture locale.
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.restoreFailed)));
      return;
    }
    if (mounted) context.pop(ExpenseEditOutcome.restored);
  }

  Future<void> _discard() async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(l10n.discardExpenseConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            key: const Key('confirm-discard'),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.discardExpense),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final db = await ref.read(databaseProvider.future);
      await db.discardExpense(widget.expenseId);
    } on Object {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.saveFailed)));
      return;
    }
    if (mounted) context.pop(ExpenseEditOutcome.discarded);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Card(
      key: const Key('expense-conflict'),
      color: scheme.errorContainer,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.expenseConflictExplanation,
              style: TextStyle(color: scheme.onErrorContainer),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  key: const Key('restore-expense'),
                  onPressed: _busy ? null : _restore,
                  child: Text(l10n.restoreExpense),
                ),
                OutlinedButton(
                  key: const Key('discard-expense'),
                  onPressed: _busy ? null : _discard,
                  child: Text(l10n.discardExpense),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
