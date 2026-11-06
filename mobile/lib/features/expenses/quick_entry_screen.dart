import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/account/account_context.dart';
import '../../core/dates/date_display.dart';
import '../../core/dates/today.dart';
import '../../core/db/app_database.dart';
import '../../core/db/expense_store.dart';
import '../../core/money/amount_input.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import 'category_picker.dart';
import 'expense_conflict_banner.dart';
import 'expense_providers.dart';
import 'tags_input.dart';

/// Issue de l'écran ouvert sur une dépense existante (P6-06).
enum ExpenseEditOutcome { saved, deleted, restored, discarded }

/// Saisie rapide (F-DEP-01 à 03) : montant au clavier numérique, catégorie
/// (dernière utilisée présélectionnée), date du jour dans le fuseau du compte ;
/// enregistrée immédiatement dans la base locale, envoyée plus tard (P6-05).
/// Avec [expenseId] : modification d'une dépense existante (F-DEP-10).
class QuickEntryScreen extends ConsumerWidget {
  const QuickEntryScreen({super.key, this.expenseId});

  final String? expenseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final id = expenseId;
    final data = ref.watch(
      id == null ? quickEntryDataProvider : expenseEditDataProvider(id),
    );
    final title = Text(
      id == null ? l10n.quickEntryTitle : l10n.editExpenseTitle,
    );
    return switch (data) {
      AsyncData(:final value) => _QuickEntryForm(data: value),
      AsyncError(error: ExpenseNotFound()) => Scaffold(
        appBar: AppBar(title: title),
        body: Center(child: Text(l10n.expenseNotFound)),
      ),
      AsyncError() => Scaffold(
        appBar: AppBar(title: title),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(l10n.accountUnavailable, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => ref.invalidate(accountContextProvider),
                  child: Text(l10n.retry),
                ),
              ],
            ),
          ),
        ),
      ),
      _ => Scaffold(
        appBar: AppBar(title: title),
        body: const Center(child: CircularProgressIndicator()),
      ),
    };
  }
}

class _QuickEntryForm extends ConsumerStatefulWidget {
  const _QuickEntryForm({required this.data});

  final QuickEntryData data;

  @override
  ConsumerState<_QuickEntryForm> createState() => _QuickEntryFormState();
}

class _QuickEntryFormState extends ConsumerState<_QuickEntryForm> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  final _merchant = TextEditingController();
  final _tags = TextEditingController();
  late String? _categoryId = widget.data.lastCategoryId;
  late final String _today = todayIn(
    widget.data.account.timeZone,
    ref.read(clockProvider)(),
  );
  late String _date = _editing?.date ?? _today;
  var _prefilled = false;
  String? _amountError;
  String? _categoryError;
  String? _tagsError;
  String? _noteError;
  String? _merchantError;
  bool _saving = false;

  Expense? get _editing => widget.data.expense;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final e = _editing;
    if (_prefilled || e == null) return;
    _prefilled = true;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final separator = NumberFormat.decimalPattern(locale).symbols.DECIMAL_SEP;
    _amount.text = amountToInput(e.amount, e.currency, separator);
    _note.text = e.note ?? '';
    _merchant.text = e.merchant ?? '';
    _tags.text = (jsonDecode(e.tags) as List).cast<String>().join(', ');
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _merchant.dispose();
    _tags.dispose();
    super.dispose();
  }

  String get _currency => _editing?.currency ?? widget.data.account.currency;

  String _amountMessage(AppLocalizations l10n, AmountErrorKind kind) =>
      switch (kind) {
        AmountErrorKind.empty => l10n.amountEmpty,
        AmountErrorKind.invalid => l10n.amountInvalid,
        AmountErrorKind.tooManyDecimals => l10n.amountTooManyDecimals,
        AmountErrorKind.tooLarge => l10n.amountTooLarge,
        AmountErrorKind.notPositive => l10n.amountNotPositive,
      };

  Future<void> _save() async {
    if (_saving) return;
    final l10n = AppLocalizations.of(context);
    final amount = parseAmountInput(_amount.text, _currency);
    final tags = parseTags(_tags.text);
    final note = _trimmedOrNull(_note.text);
    final merchant = _trimmedOrNull(_merchant.text);
    setState(() {
      // Unités UTF-16, comme `z.string().max` côté API (le compteur du champ
      // compte des graphèmes).
      _noteError = (note?.length ?? 0) > noteMaxLength
          ? l10n.noteTooLong
          : null;
      _merchantError = (merchant?.length ?? 0) > merchantMaxLength
          ? l10n.merchantTooLong
          : null;
      _amountError = switch (amount) {
        AmountOk() => null,
        AmountError(:final kind) => _amountMessage(l10n, kind),
      };
      _categoryError = _categoryId == null ? l10n.categoryRequired : null;
      _tagsError = switch (tags) {
        TagsOk() => null,
        TagsError(kind: TagsErrorKind.tooMany) => l10n.tagsTooMany,
        TagsError(kind: TagsErrorKind.tooLong) => l10n.tagTooLong,
      };
    });
    if (amount is! AmountOk ||
        tags is! TagsOk ||
        _categoryId == null ||
        _noteError != null ||
        _merchantError != null) {
      return;
    }
    setState(() => _saving = true);
    final account = widget.data.account;
    try {
      final db = await ref.read(databaseProvider.future);
      final editing = _editing;
      if (editing != null) {
        final found = await db.updateLocalExpense(
          editing.id,
          amount: amount.cents,
          categoryId: _categoryId!,
          date: _date,
          note: note,
          merchant: merchant,
          tags: tags.names,
          now: ref.read(clockProvider)(),
        );
        if (!mounted) return;
        if (found) {
          context.pop(ExpenseEditOutcome.saved);
          return;
        }
        // Supprimée entre-temps (synchro) : rien n'a été écrit.
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(l10n.expenseNotFound)));
        return;
      }
      await db.transaction(() async {
        await db.insertLocalExpense(
          id: ref.read(idGeneratorProvider)(),
          notebookId: account.notebookId,
          amount: amount.cents,
          currency: _currency,
          categoryId: _categoryId!,
          date: _date,
          now: ref.read(clockProvider)(),
          note: note,
          merchant: merchant,
          tags: tags.names,
        );
        await db.writeMeta(quickEntryLastCategoryKey, _categoryId!);
      });
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.saveFailed)));
      return;
    }
    if (!mounted) return;
    context.pop(true);
  }

  Future<void> _pickDate() async {
    final current = parsePlainDate(_date);
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = formatPlainDate(picked));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final separator = NumberFormat.decimalPattern(locale).symbols.DECIMAL_SEP;
    final dateText = _date == _today
        ? l10n.today
        : formatCalendarDate(_date, locale, long: true);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _editing == null ? l10n.quickEntryTitle : l10n.editExpenseTitle,
        ),
        actions: [
          if (_editing != null)
            IconButton(
              key: const Key('delete-expense'),
              tooltip: l10n.deleteExpense,
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: _saving
                  ? null
                  : () => context.pop(ExpenseEditOutcome.deleted),
            ),
          TextButton(
            key: const Key('save-expense'),
            onPressed: _saving ? null : _save,
            child: Text(l10n.save),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_editing case final e? when e.syncError == 'conflict')
            ExpenseConflictBanner(
              account: widget.data.account,
              expenseId: e.id,
            ),
          TextField(
            key: const Key('expense-amount'),
            controller: _amount,
            autofocus: _editing == null,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [AmountInputFormatter(separator)],
            textInputAction: TextInputAction.done,
            style: Theme.of(context).textTheme.headlineMedium,
            decoration: InputDecoration(
              labelText: l10n.amountLabel,
              suffixText: _currency,
              errorText: _amountError,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            l10n.categoryLabel,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 8),
          CategoryPicker(
            categories: widget.data.categories,
            selectedId: _categoryId,
            onSelected: (id) => setState(() {
              _categoryId = id;
              _categoryError = null;
            }),
          ),
          if (_categoryError != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _categoryError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          const SizedBox(height: 8),
          ListTile(
            key: const Key('expense-date'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event_rounded),
            title: Text(l10n.dateLabel),
            trailing: Text(dateText),
            onTap: _pickDate,
          ),
          TextField(
            key: const Key('expense-merchant'),
            controller: _merchant,
            maxLength: merchantMaxLength,
            decoration: InputDecoration(
              labelText: l10n.merchantLabel,
              errorText: _merchantError,
            ),
          ),
          TextField(
            key: const Key('expense-note'),
            controller: _note,
            maxLength: noteMaxLength,
            maxLines: null,
            decoration: InputDecoration(
              labelText: l10n.noteLabel,
              errorText: _noteError,
            ),
          ),
          TextField(
            key: const Key('expense-tags'),
            controller: _tags,
            decoration: InputDecoration(
              labelText: l10n.tagsLabel,
              helperText: l10n.tagsHint,
              errorText: _tagsError,
            ),
          ),
        ],
      ),
    );
  }
}

String? _trimmedOrNull(String text) {
  final trimmed = text.trim();
  return trimmed.isEmpty ? null : trimmed;
}
