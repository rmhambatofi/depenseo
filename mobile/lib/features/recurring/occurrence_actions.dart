import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/dates/date_display.dart';
import '../../core/money/amount_input.dart';
import '../../core/recurring/recurring_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../expenses/expense_providers.dart';
import 'recurring_providers.dart';
import 'recurring_screen.dart';

/// Identifiant de dépense tiré une fois par échéance : un nouvel essai après
/// une réponse perdue rejoue le même paiement (POST idempotent, ADR-032).
final payExpenseIdsProvider = Provider<Map<String, String>>((ref) => {});

enum _Action { pay, adjust, reset, skip }

/// Payer (ou confirmer), ajuster, sauter une échéance (F-REC-02/03).
Future<void> showOccurrenceActions(
  BuildContext context,
  WidgetRef ref,
  RecurringScreenData data,
  Occurrence o,
) async {
  final l10n = AppLocalizations.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final action = await showModalBottomSheet<_Action>(
    context: context,
    builder: (context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            key: const Key('occurrence-pay'),
            leading: const Icon(Icons.check_circle_outline_rounded),
            title: Text(
              o.awaitingConfirmation
                  ? l10n.occurrenceConfirm
                  : l10n.occurrencePay,
            ),
            onTap: () => Navigator.pop(context, _Action.pay),
          ),
          ListTile(
            key: const Key('occurrence-adjust'),
            leading: const Icon(Icons.edit_rounded),
            title: Text(l10n.occurrenceAdjust),
            onTap: () => Navigator.pop(context, _Action.adjust),
          ),
          if (o.adjusted)
            ListTile(
              key: const Key('occurrence-reset'),
              leading: const Icon(Icons.undo_rounded),
              title: Text(l10n.occurrenceResetAmount),
              onTap: () => Navigator.pop(context, _Action.reset),
            ),
          ListTile(
            key: const Key('occurrence-skip'),
            leading: const Icon(Icons.skip_next_rounded),
            title: Text(l10n.occurrenceSkip),
            onTap: () => Navigator.pop(context, _Action.skip),
          ),
        ],
      ),
    ),
  );
  if (action == null || !context.mounted) return;
  switch (action) {
    case _Action.pay:
      final expenseId = ref
          .read(payExpenseIdsProvider)
          .putIfAbsent(o.id, ref.read(idGeneratorProvider));
      await runRecurringWrite(
        messenger,
        l10n,
        () => writeRecurring(
          ref,
          data,
          (api, notebook) => api.pay(notebook, o.id, expenseId: expenseId),
          syncAfter: true,
        ),
        success: l10n.occurrencePaid,
      );
    case _Action.adjust:
      final amount = await showDialog<int>(
        context: context,
        builder: (_) => _AdjustDialog(occurrence: o),
      );
      if (amount == null || !context.mounted) return;
      await runRecurringWrite(
        messenger,
        l10n,
        () => writeRecurring(
          ref,
          data,
          (api, notebook) => api.adjust(notebook, o.id, amount),
        ),
        success: l10n.occurrenceAdjusted,
      );
    case _Action.reset:
      await runRecurringWrite(
        messenger,
        l10n,
        () => writeRecurring(
          ref,
          data,
          (api, notebook) => api.adjust(notebook, o.id, null),
        ),
        success: l10n.occurrenceAdjusted,
      );
    case _Action.skip:
      final locale = Localizations.localeOf(context).toLanguageTag();
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          content: Text(
            l10n.occurrenceSkipConfirm(formatCalendarDate(o.dueDate, locale)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(l10n.cancel),
            ),
            TextButton(
              key: const Key('confirm-skip'),
              onPressed: () => Navigator.pop(context, true),
              child: Text(l10n.occurrenceSkip),
            ),
          ],
        ),
      );
      if (confirmed != true || !context.mounted) return;
      await runRecurringWrite(
        messenger,
        l10n,
        () => writeRecurring(
          ref,
          data,
          (api, notebook) => api.skip(notebook, o.id),
        ),
        success: l10n.occurrenceSkipped,
      );
  }
}

/// Saisie du montant ajusté ; renvoie des unités mineures.
class _AdjustDialog extends StatefulWidget {
  const _AdjustDialog({required this.occurrence});

  final Occurrence occurrence;

  @override
  State<_AdjustDialog> createState() => _AdjustDialogState();
}

class _AdjustDialogState extends State<_AdjustDialog> {
  late final TextEditingController _amount;
  String? _error;
  bool _prefilled = false;

  String get _separator => NumberFormat.decimalPattern(
    Localizations.localeOf(context).toLanguageTag(),
  ).symbols.DECIMAL_SEP;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_prefilled) return;
    _prefilled = true;
    final o = widget.occurrence;
    _amount.text = amountToInput(o.amount, o.currency, _separator);
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _submit() {
    final l10n = AppLocalizations.of(context);
    switch (parseAmountInput(_amount.text, widget.occurrence.currency)) {
      case AmountOk(:final cents):
        Navigator.pop(context, cents);
      case AmountError(:final kind):
        setState(() => _error = amountErrorMessage(l10n, kind));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AlertDialog(
      title: Text(l10n.occurrenceAdjust),
      content: TextField(
        key: const Key('adjust-amount'),
        controller: _amount,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [AmountInputFormatter(_separator)],
        decoration: InputDecoration(
          labelText: l10n.amountLabel,
          suffixText: widget.occurrence.currency,
          errorText: _error,
        ),
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.cancel),
        ),
        TextButton(
          key: const Key('confirm-adjust'),
          onPressed: _submit,
          child: Text(l10n.save),
        ),
      ],
    );
  }
}

String amountErrorMessage(AppLocalizations l10n, AmountErrorKind kind) =>
    switch (kind) {
      AmountErrorKind.empty => l10n.amountEmpty,
      AmountErrorKind.invalid => l10n.amountInvalid,
      AmountErrorKind.tooManyDecimals => l10n.amountTooManyDecimals,
      AmountErrorKind.tooLarge => l10n.amountTooLarge,
      AmountErrorKind.notPositive => l10n.amountNotPositive,
    };
