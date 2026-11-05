import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../core/recurring/recurring_api.dart';
import '../../l10n/generated/app_localizations.dart';
import 'occurrence_actions.dart';
import 'recurring_providers.dart';

/// Dépenses récurrentes (F-REC-01..04, ADR-054) : échéances en attente avec
/// payer / confirmer / ajuster / sauter, liste des récurrences, heure des
/// rappels. En ligne seulement.
class RecurringScreen extends ConsumerWidget {
  const RecurringScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(recurringOverviewProvider);
    final value = state.value;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.recurringTitle)),
      floatingActionButton: value == null || state.hasError
          ? null
          : FloatingActionButton.extended(
              key: const Key('add-recurring'),
              onPressed: () => context.push('/settings/recurring/new'),
              icon: const Icon(Icons.add),
              label: Text(l10n.recurringAdd),
            ),
      body: switch (state) {
        // Contenu gardé pendant le rechargement qui suit une écriture.
        AsyncValue(:final value?) => _RecurringList(
          data: value,
          stale: state.hasError,
        ),
        AsyncError() => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.recurringOffline, key: const Key('recurring-offline')),
              TextButton(
                key: const Key('recurring-retry'),
                onPressed: () => ref.invalidate(recurringOverviewProvider),
                child: Text(l10n.retry),
              ),
            ],
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _RecurringList extends ConsumerWidget {
  const _RecurringList({required this.data, required this.stale});

  final RecurringScreenData data;

  /// Rechargement en échec : actions désactivées (état peut-être périmé).
  final bool stale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final text = Theme.of(context).textTheme;
    final overview = data.overview;
    Widget header(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(title, style: text.titleMedium),
    );
    return ListView(
      padding: const EdgeInsets.only(bottom: 88),
      children: [
        if (stale) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text(
              l10n.recurringOffline,
              key: const Key('recurring-stale'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => ref.invalidate(recurringOverviewProvider),
              child: Text(l10n.retry),
            ),
          ),
        ],
        header(l10n.recurringUpcomingTitle),
        if (overview.pending.isEmpty)
          ListTile(
            key: const Key('no-occurrence'),
            title: Text(l10n.recurringUpcomingNone),
          ),
        for (final o in overview.pending)
          ListTile(
            key: Key('occurrence-${o.id}'),
            leading: Icon(
              o.awaitingConfirmation
                  ? Icons.notification_important_outlined
                  : Icons.event_outlined,
            ),
            title: Text(o.name),
            subtitle: Text(
              [
                l10n.recurringDue(formatCalendarDate(o.dueDate, locale)),
                if (o.awaitingConfirmation) l10n.recurringAwaiting,
              ].join(' · '),
            ),
            trailing: Text(
              occurrenceAmount(
                l10n,
                o.amount,
                o.currency,
                o.amountKind,
                locale,
              ),
              key: Key('occurrence-amount-${o.id}'),
            ),
            enabled: !stale,
            onTap: () => showOccurrenceActions(context, ref, data, o),
          ),
        const Divider(),
        header(l10n.recurringListTitle),
        if (overview.recurring.isEmpty)
          ListTile(
            key: const Key('no-recurring'),
            title: Text(l10n.recurringNone),
          ),
        for (final r in overview.recurring)
          ListTile(
            key: Key('recurring-${r.id}'),
            title: Text(r.name),
            subtitle: Text(frequencyLabel(l10n, r.frequency)),
            trailing: Text(
              occurrenceAmount(
                l10n,
                r.amount,
                r.currency,
                r.amountKind,
                locale,
              ),
            ),
            enabled: !stale,
            onTap: () => context.push('/settings/recurring/${r.id}'),
          ),
        const Divider(),
        ListTile(
          key: const Key('reminder-time'),
          leading: const Icon(Icons.notifications_outlined),
          title: Text(l10n.recurringReminderTime),
          subtitle: Text(
            l10n.recurringReminderTimeValue(overview.reminderTime),
          ),
          enabled: !stale,
          onTap: () => _pickReminderTime(context, ref),
        ),
      ],
    );
  }

  Future<void> _pickReminderTime(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final parts = data.overview.reminderTime.split(':');
    final hour = (int.tryParse(parts.first) ?? 9).clamp(0, 23);
    final minute = (parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0).clamp(
      0,
      59,
    );
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: hour, minute: minute),
    );
    if (picked == null) return;
    String two(int n) => n.toString().padLeft(2, '0');
    final time = '${two(picked.hour)}:${two(picked.minute)}';
    if (time == data.overview.reminderTime) return;
    await runRecurringWrite(
      messenger,
      l10n,
      () => writeRecurring(ref, data, (api, _) => api.setReminderTime(time)),
      success: l10n.recurringSaved,
    );
  }
}

/// Montant d'une récurrence ou d'une échéance ; « ≈ » s'il est estimé.
String occurrenceAmount(
  AppLocalizations l10n,
  int amount,
  String currency,
  AmountKind kind,
  String locale,
) {
  final formatted = formatAmount(amount, currency, locale);
  return kind == AmountKind.estimated
      ? l10n.recurringEstimated(formatted)
      : formatted;
}

String frequencyLabel(AppLocalizations l10n, RecurrenceFrequency f) =>
    switch (f) {
      RecurrenceFrequency.weekly => l10n.recurringFrequencyWeekly,
      RecurrenceFrequency.monthly => l10n.recurringFrequencyMonthly,
      RecurrenceFrequency.quarterly => l10n.recurringFrequencyQuarterly,
      RecurrenceFrequency.yearly => l10n.recurringFrequencyYearly,
      RecurrenceFrequency.once => l10n.recurringFrequencyOnce,
    };

String recurringMessage(AppLocalizations l10n, RecurringFailure failure) =>
    switch (failure) {
      RecurringFailure.offline => l10n.recurringOffline,
      RecurringFailure.invalid => l10n.recurringInvalid,
      RecurringFailure.conflict => l10n.recurringConflict,
    };

/// Exécute [write] et annonce le résultat dans une SnackBar. Renvoie vrai en
/// cas de succès.
Future<bool> runRecurringWrite(
  ScaffoldMessengerState messenger,
  AppLocalizations l10n,
  Future<void> Function() write, {
  required String success,
}) async {
  try {
    await write();
    messenger.showSnackBar(SnackBar(content: Text(success)));
    return true;
  } on RecurringError catch (e) {
    messenger.showSnackBar(
      SnackBar(content: Text(recurringMessage(l10n, e.failure))),
    );
    return false;
  }
}
