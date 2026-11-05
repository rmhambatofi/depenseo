import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/dates/today.dart';
import '../../core/money/amount_input.dart';
import '../../core/recurring/recurring_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import '../expenses/category_picker.dart';
import '../expenses/expense_providers.dart';
import '../expenses/expense_tile.dart' show formatCalendarDate;
import 'occurrence_actions.dart' show amountErrorMessage;
import 'recurring_providers.dart';
import 'recurring_screen.dart';

/// Champs d'une dépense récurrente (F-REC-01/02/04, ADR-054).
class RecurringForm extends ConsumerStatefulWidget {
  const RecurringForm({
    super.key,
    required this.data,
    this.editing,
    this.enabled = true,
  });

  final RecurringScreenData data;
  final Recurring? editing;

  /// Faux tant que les récurrences n'ont pas pu être rechargées.
  final bool enabled;

  @override
  ConsumerState<RecurringForm> createState() => _RecurringFormState();
}

class _RecurringFormState extends ConsumerState<RecurringForm> {
  final _name = TextEditingController();
  final _amount = TextEditingController();
  late AmountKind _amountKind;
  late RecurrenceFrequency _frequency;
  late String _startDate;
  String? _categoryId;
  late RecurrenceMode _mode;
  late bool _remindThreeDays;
  late bool _remindOnDueDate;
  String? _nameError;
  String? _amountError;
  String? _categoryError;
  bool _busy = false;
  bool _prefilled = false;

  /// Tiré une fois : un nouvel essai après une réponse perdue rejoue la même
  /// création (POST idempotent).
  late final String _newId = ref.read(idGeneratorProvider)();

  Recurring? get _editing => widget.editing;

  String get _currency => _editing?.currency ?? widget.data.account.currency;

  String get _separator => NumberFormat.decimalPattern(
    Localizations.localeOf(context).toLanguageTag(),
  ).symbols.DECIMAL_SEP;

  @override
  void initState() {
    super.initState();
    final r = _editing;
    _name.text = r?.name ?? '';
    _amountKind = r?.amountKind ?? AmountKind.fixed;
    _frequency = r?.frequency ?? RecurrenceFrequency.monthly;
    _startDate =
        r?.startDate ??
        todayIn(widget.data.account.timeZone, ref.read(clockProvider)());
    _categoryId = r?.categoryId;
    _mode = r?.mode ?? RecurrenceMode.confirm;
    _remindThreeDays = r?.remindThreeDaysBefore ?? true;
    _remindOnDueDate = r?.remindOnDueDate ?? true;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_prefilled) return;
    _prefilled = true;
    if (_editing case final r?) {
      _amount.text = amountToInput(r.amount, r.currency, _separator);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickStartDate() async {
    final [y, m, d] = _startDate.split('-').map(int.parse).toList();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(y, m, d),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _startDate = formatPlainDate(picked));
  }

  /// Corps complet de création, ou champs modifiés seulement (PATCH).
  Map<String, Object?> _fields(String name, int amount) => {
    'name': name,
    'amount': amount,
    'amountKind': _amountKind.name,
    'categoryId': _categoryId,
    'mode': _mode.name,
    'remindThreeDaysBefore': _remindThreeDays,
    'remindOnDueDate': _remindOnDueDate,
  };

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final name = _name.text.trim();
    int? amount;
    String? amountError;
    switch (parseAmountInput(_amount.text, _currency)) {
      case AmountOk(:final cents):
        amount = cents;
      case AmountError(:final kind):
        amountError = amountErrorMessage(l10n, kind);
    }
    setState(() {
      _nameError = name.isEmpty ? l10n.recurringNameRequired : null;
      _amountError = amountError;
      _categoryError = _categoryId == null ? l10n.categoryRequired : null;
    });
    if (name.isEmpty || amount == null || _categoryId == null) return;
    final wanted = _fields(name, amount);
    final editing = _editing;
    final Future<void> Function(RecurringApi, String) write;
    if (editing == null) {
      write = (api, notebook) => api.create(notebook, {
        'id': _newId,
        ...wanted,
        'frequency': _frequency.name,
        'startDate': _startDate,
      });
    } else {
      final patch = editing.changes(wanted);
      if (patch.isEmpty) {
        context.pop();
        return;
      }
      write = (api, notebook) => api.update(notebook, editing.id, patch);
    }
    setState(() => _busy = true);
    final ok = await runRecurringWrite(
      messenger,
      l10n,
      () => writeRecurring(ref, widget.data, write),
      success: l10n.recurringSaved,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) context.pop();
  }

  Future<void> _delete(Recurring r) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(l10n.recurringDeleteConfirm(r.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            key: const Key('confirm-delete-recurring'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.recurringDelete),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    final ok = await runRecurringWrite(
      messenger,
      l10n,
      () => writeRecurring(
        ref,
        widget.data,
        (api, notebook) => api.delete(notebook, r.id),
      ),
      success: l10n.recurringDeleted,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final editing = _editing;
    final scheduleLocked = editing != null;
    // Formulaire court : tout construit (erreurs visibles après défilement).
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('recurring-name'),
            controller: _name,
            maxLength: 100,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: l10n.recurringNameLabel,
              errorText: _nameError,
            ),
          ),
          TextField(
            key: const Key('recurring-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [AmountInputFormatter(_separator)],
            decoration: InputDecoration(
              labelText: l10n.amountLabel,
              suffixText: _currency,
              errorText: _amountError,
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<AmountKind>(
            key: const Key('recurring-amount-kind'),
            segments: [
              ButtonSegment(
                value: AmountKind.fixed,
                label: Text(
                  l10n.recurringAmountFixed,
                  key: const Key('amount-kind-fixed'),
                ),
              ),
              ButtonSegment(
                value: AmountKind.estimated,
                label: Text(
                  l10n.recurringAmountEstimated,
                  key: const Key('amount-kind-estimated'),
                ),
              ),
            ],
            selected: {_amountKind},
            onSelectionChanged: (s) => setState(() => _amountKind = s.single),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<RecurrenceFrequency>(
            key: const Key('recurring-frequency'),
            initialValue: _frequency,
            decoration: InputDecoration(
              labelText: l10n.recurringFrequencyLabel,
            ),
            items: [
              for (final f in RecurrenceFrequency.values)
                DropdownMenuItem(
                  value: f,
                  child: Text(frequencyLabel(l10n, f)),
                ),
            ],
            onChanged: scheduleLocked
                ? null
                : (f) => setState(() => _frequency = f ?? _frequency),
          ),
          ListTile(
            key: const Key('recurring-start-date'),
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.recurringStartDateLabel),
            subtitle: Text(formatCalendarDate(_startDate, locale)),
            trailing: const Icon(Icons.calendar_today_outlined),
            enabled: !scheduleLocked,
            onTap: _pickStartDate,
          ),
          if (scheduleLocked)
            Text(
              l10n.recurringScheduleLocked,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 12),
          Text(l10n.categoryLabel),
          const SizedBox(height: 4),
          CategoryPicker(
            categories: widget.data.categories,
            selectedId: _categoryId,
            onSelected: (id) => setState(() {
              _categoryId = id;
              _categoryError = null;
            }),
          ),
          if (_categoryError != null)
            Text(
              _categoryError!,
              key: const Key('recurring-category-error'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          SwitchListTile(
            key: const Key('recurring-mode-auto'),
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.recurringModeAuto),
            subtitle: Text(l10n.recurringModeAutoHint),
            value: _mode == RecurrenceMode.auto,
            onChanged: (on) => setState(
              () => _mode = on ? RecurrenceMode.auto : RecurrenceMode.confirm,
            ),
          ),
          SwitchListTile(
            key: const Key('recurring-remind-3d'),
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.recurringRemindThreeDays),
            value: _remindThreeDays,
            onChanged: (on) => setState(() => _remindThreeDays = on),
          ),
          // Sans effet en mode automatique (ADR-034) : masqué.
          if (_mode == RecurrenceMode.confirm)
            SwitchListTile(
              key: const Key('recurring-remind-due'),
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.recurringRemindOnDueDate),
              value: _remindOnDueDate,
              onChanged: (on) => setState(() => _remindOnDueDate = on),
            ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('save-recurring'),
            onPressed: _busy || !widget.enabled ? null : _save,
            child: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l10n.save),
          ),
          if (editing != null)
            TextButton(
              key: const Key('delete-recurring'),
              onPressed: _busy || !widget.enabled
                  ? null
                  : () => _delete(editing),
              child: Text(l10n.recurringDelete),
            ),
        ],
      ),
    );
  }
}
