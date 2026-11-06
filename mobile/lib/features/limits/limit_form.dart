import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/dates/date_display.dart';
import '../../core/limits/limit_api.dart';
import '../../core/limits/limit_models.dart';
import '../../core/money/amount_input.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/app_card.dart';
import '../../ui/section_header.dart';
import '../../ui/tokens.dart';
import '../expenses/expense_providers.dart';
import 'limit_providers.dart';
import 'limits_screen.dart' show limitMessage;

/// Type de limite choisi : aucune, mensuelle, hebdomadaire (F-LIM-01).
enum _Kind { none, month, week }

/// Réglages de la limite : type, montant, début de période (F-LIM-02),
/// inclusion des récurrences (F-LIM-05). Chaque enregistrement crée une
/// version datée du jour, ou modifie celle du jour (F-LIM-09).
class LimitForm extends ConsumerStatefulWidget {
  const LimitForm({super.key, required this.data, this.enabled = true});

  final LimitScreenData data;

  /// Faux tant que la jauge n'a pas pu être rechargée.
  final bool enabled;

  @override
  ConsumerState<LimitForm> createState() => _LimitFormState();
}

class _LimitFormState extends ConsumerState<LimitForm> {
  final _amount = TextEditingController();
  late _Kind _kind;
  late int _startDay;
  late bool _includeRecurring;

  /// Dernier type de période affiché (mois ou semaine).
  late LimitPeriodKind _shownPeriod;
  String? _amountError;
  bool _busy = false;
  bool _prefilled = false;

  /// Tiré une fois : un nouvel essai après une réponse perdue rejoue la même
  /// création (POST idempotent).
  late final String _newId = ref.read(idGeneratorProvider)();

  LimitOverview get _overview => widget.data.overview;

  LimitSettings get _saved => _overview.last?.settings ?? LimitSettings.initial;

  String get _currency => _overview.current.currency;

  String get _separator => NumberFormat.decimalPattern(
    Localizations.localeOf(context).toLanguageTag(),
  ).symbols.DECIMAL_SEP;

  @override
  void initState() {
    super.initState();
    final saved = _saved;
    _kind = saved.amount == null
        ? _Kind.none
        : (saved.periodKind == LimitPeriodKind.week ? _Kind.week : _Kind.month);
    _startDay = saved.startDay;
    _shownPeriod = saved.periodKind;
    _includeRecurring = saved.includeRecurring;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_prefilled) return;
    _prefilled = true;
    if (_saved.amount case final amount?) {
      _amount.text = amountToInput(amount, _currency, _separator);
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _setKind(_Kind kind) {
    final saved = _saved;
    final period = switch (kind) {
      _Kind.week => LimitPeriodKind.week,
      _Kind.month => LimitPeriodKind.month,
      _Kind.none => null,
    };
    setState(() {
      // Autre type de période : jour de début enregistré pour ce type,
      // sinon le 1er / lundi.
      if (period != null && period != _shownPeriod) {
        _startDay = period == saved.periodKind ? saved.startDay : 1;
        _shownPeriod = period;
      }
      _kind = kind;
      _amountError = null;
    });
  }

  /// Type de période envoyé : celui choisi, ou celui en vigueur pour
  /// « aucune » (l'API garde des règles de période même sans montant).
  LimitPeriodKind get _periodKind => switch (_kind) {
    _Kind.week => LimitPeriodKind.week,
    _Kind.month => LimitPeriodKind.month,
    _Kind.none => _saved.periodKind,
  };

  String _amountMessage(AppLocalizations l10n, AmountErrorKind kind) =>
      switch (kind) {
        AmountErrorKind.empty => l10n.amountEmpty,
        AmountErrorKind.invalid => l10n.amountInvalid,
        AmountErrorKind.tooManyDecimals => l10n.amountTooManyDecimals,
        AmountErrorKind.tooLarge => l10n.amountTooLarge,
        AmountErrorKind.notPositive => l10n.amountNotPositive,
      };

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    int? amount;
    if (_kind != _Kind.none) {
      switch (parseAmountInput(_amount.text, _currency)) {
        case AmountOk(:final cents):
          amount = cents;
        case AmountError(:final kind):
          setState(() => _amountError = _amountMessage(l10n, kind));
          return;
      }
    }
    final saved = _saved;
    final wanted = LimitSettings(
      amount: amount,
      periodKind: _periodKind,
      startDay: _kind == _Kind.none ? saved.startDay : _startDay,
      includeRecurring: _kind == _Kind.none
          ? saved.includeRecurring
          : _includeRecurring,
    );
    final write = planLimitWrite(
      last: _overview.last,
      today: _overview.today,
      wanted: wanted,
      newId: _newId,
    );
    setState(() {
      _amountError = null;
      _busy = true;
    });
    try {
      await writeLimit(ref, widget.data, write);
      messenger.showSnackBar(SnackBar(content: Text(l10n.limitSaved)));
    } on LimitError catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(limitMessage(l10n, e.failure))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final last = _overview.last;
    final hasLimit = _kind != _Kind.none;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 16,
      children: [
        SectionHeader(
          title: l10n.limitSettingsTitle,
          icon: Icons.tune_rounded,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
        ),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: AppSpacing.md,
            children: [
              SegmentedButton<_Kind>(
                key: const Key('limit-kind'),
                segments: [
                  ButtonSegment(
                    value: _Kind.none,
                    label: _segmentLabel(l10n.limitKindNone, 'limit-kind-none'),
                  ),
                  ButtonSegment(
                    value: _Kind.month,
                    label: _segmentLabel(
                      l10n.limitKindMonth,
                      'limit-kind-month',
                    ),
                  ),
                  ButtonSegment(
                    value: _Kind.week,
                    label: _segmentLabel(l10n.limitKindWeek, 'limit-kind-week'),
                  ),
                ],
                selected: {_kind},
                onSelectionChanged: (s) => _setKind(s.single),
              ),
              if (hasLimit) ...[
                TextField(
                  key: const Key('limit-amount'),
                  controller: _amount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [AmountInputFormatter(_separator)],
                  decoration: InputDecoration(
                    labelText: l10n.limitAmountLabel,
                    suffixText: _currency,
                    errorText: _amountError,
                  ),
                ),
                DropdownButtonFormField<int>(
                  // Liste différente selon le type : nouvel état à chaque bascule.
                  key: Key('limit-start-day-${_kind.name}'),
                  initialValue: _startDay,
                  decoration: InputDecoration(
                    labelText: _kind == _Kind.week
                        ? l10n.limitStartDayWeek
                        : l10n.limitStartDayMonth,
                  ),
                  items: [
                    if (_kind == _Kind.week)
                      for (var d = 1; d <= 7; d++)
                        DropdownMenuItem(
                          value: d,
                          child: Text(_weekday(locale, d)),
                        )
                    else
                      for (var d = 1; d <= 31; d++)
                        DropdownMenuItem(
                          value: d,
                          child: Text(l10n.limitStartDayOption(d)),
                        ),
                  ],
                  onChanged: (d) => setState(() => _startDay = d ?? _startDay),
                ),
                SwitchListTile(
                  key: const Key('limit-include-recurring'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.limitIncludeRecurring),
                  subtitle: Text(l10n.limitIncludeRecurringHint),
                  value: _includeRecurring,
                  onChanged: (on) => setState(() => _includeRecurring = on),
                ),
              ],
            ],
          ),
        ),
        // Règles enregistrées qui ne s'appliqueront qu'à la prochaine
        // période (F-LIM-09).
        if (last != null && last.appliesFrom.compareTo(_overview.today) > 0)
          Text(
            l10n.limitUpcoming(formatCalendarDate(last.appliesFrom, locale)),
            key: const Key('limit-upcoming'),
          ),
        FilledButton(
          key: const Key('save-limit'),
          onPressed: _busy || !widget.enabled ? null : _save,
          child: _busy
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.save),
        ),
      ],
    );
  }
}

/// Nom du jour ISO [day] (1 = lundi … 7 = dimanche) dans la langue [locale].
String _weekday(String locale, int day) {
  final name = DateFormat.EEEE(locale).dateSymbols.STANDALONEWEEKDAYS[day % 7];
  return name.isEmpty ? name : name[0].toUpperCase() + name.substring(1);
}

/// Libellé d'un mot (« Hebdomadaire ») : réduit plutôt que coupé au milieu
/// dans un segment étroit (dès le texte ×1 sur 390 points).
Widget _segmentLabel(String text, String key) => FittedBox(
  fit: BoxFit.scaleDown,
  child: Text(text, key: Key(key), maxLines: 1),
);
