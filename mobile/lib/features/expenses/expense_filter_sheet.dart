import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/dates/date_display.dart';
import '../../core/dates/today.dart';
import '../../core/db/app_database.dart';
import '../../core/db/expense_filter.dart';
import '../../core/money/amount_input.dart';
import '../../l10n/generated/app_localizations.dart';
import '../categories/category_badge.dart';
import 'expense_providers.dart';

/// Ouvre la feuille des critères (période, montant, catégories) et applique
/// ceux validés ; le texte de recherche est conservé.
Future<void> showExpenseFilterSheet(BuildContext context, WidgetRef ref) async {
  final current = ref.read(expenseFilterProvider);
  final applied = await showModalBottomSheet<ExpenseFilter>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _FilterSheet(initial: current),
  );
  if (applied != null) {
    ref.read(expenseFilterProvider.notifier).setCriteria(applied);
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.initial});

  final ExpenseFilter initial;

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  final _min = TextEditingController();
  final _max = TextEditingController();
  late String? _from = widget.initial.from;
  late String? _to = widget.initial.to;
  late Set<String> _categories = {...widget.initial.categoryIds};
  String? _minError;
  String? _maxError;
  var _prefilled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_prefilled) return;
    _prefilled = true;
    final currency = _currency;
    if (currency == null) return;
    final sep = _separator;
    if (widget.initial.minAmount case final v?) {
      _min.text = amountToInput(v, currency, sep);
    }
    if (widget.initial.maxAmount case final v?) {
      _max.text = amountToInput(v, currency, sep);
    }
  }

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  String? get _currency => ref.read(accountContextProvider).value?.currency;

  String get _separator => NumberFormat.decimalPattern(
    Localizations.localeOf(context).toLanguageTag(),
  ).symbols.DECIMAL_SEP;

  /// `(valeur, message d'erreur)` ; champ vide = pas de borne.
  (int?, String?) _bound(AppLocalizations l10n, String text) {
    if (text.trim().isEmpty) return (null, null);
    return switch (parseAmountInput(text, _currency ?? 'EUR')) {
      AmountOk(:final cents) => (cents, null),
      AmountError() => (null, l10n.amountInvalid),
    };
  }

  void _apply() {
    final l10n = AppLocalizations.of(context);
    final (min, minError) = _bound(l10n, _min.text);
    var (max, maxError) = _bound(l10n, _max.text);
    if (min != null && max != null && min > max) {
      maxError = l10n.amountRangeInvalid;
    }
    setState(() {
      _minError = minError;
      _maxError = maxError;
    });
    if (minError != null || maxError != null) return;
    Navigator.of(context).pop(
      ExpenseFilter(
        minAmount: min,
        maxAmount: max,
        from: _from,
        to: _to,
        categoryIds: _categories,
      ),
    );
  }

  Future<void> _pickPeriod() async {
    DateTime? parts(String? d) => d == null ? null : parsePlainDate(d);

    final from = parts(_from);
    final to = parts(_to);
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      initialDateRange: from != null && to != null
          ? DateTimeRange(start: from, end: to)
          : null,
    );
    if (picked == null) return;
    setState(() {
      _from = formatPlainDate(picked.start);
      _to = formatPlainDate(picked.end);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final categories =
        ref.watch(filterCategoriesProvider).value ?? const <Category>[];
    final separator = _separator;
    String show(String d) => formatCalendarDate(d, locale);

    final period = switch ((_from, _to)) {
      (final f?, final t?) => '${show(f)} – ${show(t)}',
      (final f?, null) => '≥ ${show(f)}',
      (null, final t?) => '≤ ${show(t)}',
      _ => l10n.periodAny,
    };
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Text(
            l10n.filtersTitle,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          ListTile(
            key: const Key('filter-period'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.date_range_outlined),
            title: Text(l10n.periodLabel),
            subtitle: Text(period),
            trailing: _from == null && _to == null
                ? null
                : IconButton(
                    key: const Key('filter-period-clear'),
                    tooltip: l10n.filtersReset,
                    icon: const Icon(Icons.clear),
                    onPressed: () => setState(() => _from = _to = null),
                  ),
            onTap: _pickPeriod,
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  key: const Key('filter-min-amount'),
                  controller: _min,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [AmountInputFormatter(separator)],
                  decoration: InputDecoration(
                    labelText: l10n.minAmountLabel,
                    suffixText: _currency,
                    errorText: _minError,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: TextField(
                  key: const Key('filter-max-amount'),
                  controller: _max,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [AmountInputFormatter(separator)],
                  decoration: InputDecoration(
                    labelText: l10n.maxAmountLabel,
                    suffixText: _currency,
                    errorText: _maxError,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            l10n.categoryLabel,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final c in categories)
                FilterChip(
                  key: Key('filter-category-${c.id}'),
                  // Coche masquée : elle cacherait l'icône ; la couleur et
                  // la sémantique signalent la sélection.
                  showCheckmark: false,
                  avatar: CategoryIconBadge(
                    icon: c.icon,
                    color: c.color,
                    size: 24,
                  ),
                  label: Text(c.name),
                  selected: _categories.contains(c.id),
                  onSelected: (on) => setState(() {
                    _categories = on
                        ? {..._categories, c.id}
                        : ({..._categories}..remove(c.id));
                  }),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                key: const Key('reset-filters'),
                onPressed: () =>
                    Navigator.of(context).pop(const ExpenseFilter()),
                child: Text(l10n.filtersReset),
              ),
              const SizedBox(width: 8),
              FilledButton(
                key: const Key('apply-filters'),
                onPressed: _apply,
                child: Text(l10n.filtersApply),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
