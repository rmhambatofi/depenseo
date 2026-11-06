import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates/date_display.dart';
import '../../core/money/amount_format.dart';
import '../../core/recurring/recurring_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/grouped_card.dart';
import '../../ui/icon_tile.dart';
import '../../ui/section_header.dart';
import '../../ui/tokens.dart';
import '../shell/account_avatar.dart';
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
      appBar: AppBar(
        title: Text(l10n.recurringTitle),
        actions: const [AccountAvatarButton()],
      ),
      floatingActionButton: value == null || state.hasError
          ? null
          : FloatingActionButton.extended(
              key: const Key('add-recurring'),
              onPressed: () => context.push('/recurring/new'),
              icon: const Icon(Icons.add_rounded),
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
    final t = AppTokens.of(context);
    final overview = data.overview;
    // Sans couleur imposée : le ListTile grise la ligne désactivée.
    const amountStyle = TextStyle(
      fontWeight: FontWeight.w600,
      fontFeatures: [FontFeature.tabularFigures()],
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        AppSizes.fabClearance,
      ),
      children: [
        if (stale) ...[
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: Text(
              l10n.recurringOffline,
              key: const Key('recurring-stale'),
              style: TextStyle(color: t.danger),
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
        SectionHeader(
          title: l10n.recurringUpcomingTitle,
          icon: Icons.event_rounded,
        ),
        GroupedCard(
          children: [
            if (overview.pending.isEmpty)
              ListTile(
                key: const Key('no-occurrence'),
                title: Text(l10n.recurringUpcomingNone),
              ),
            for (final o in overview.pending)
              ListTile(
                key: Key('occurrence-${o.id}'),
                leading: o.awaitingConfirmation
                    ? IconTile(
                        icon: Icons.notification_important_rounded,
                        color: t.warning,
                        size: AppSizes.rowTile,
                      )
                    : const IconTile(
                        icon: Icons.event_rounded,
                        size: AppSizes.rowTile,
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
                  style: amountStyle,
                ),
                enabled: !stale,
                onTap: () => showOccurrenceActions(context, ref, data, o),
              ),
          ],
        ),
        SectionHeader(
          title: l10n.recurringListTitle,
          icon: Icons.autorenew_rounded,
        ),
        GroupedCard(
          children: [
            if (overview.recurring.isEmpty)
              ListTile(
                key: const Key('no-recurring'),
                title: Text(l10n.recurringNone),
              ),
            for (final r in overview.recurring)
              ListTile(
                key: Key('recurring-${r.id}'),
                leading: const IconTile(
                  icon: Icons.autorenew_rounded,
                  size: AppSizes.rowTile,
                ),
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
                  style: amountStyle,
                ),
                enabled: !stale,
                onTap: () => context.push('/recurring/${r.id}'),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        GroupedCard(
          children: [
            ListTile(
              key: const Key('reminder-time'),
              leading: const IconTile(
                icon: Icons.notifications_rounded,
                size: AppSizes.rowTile,
              ),
              title: Text(l10n.recurringReminderTime),
              subtitle: Text(
                l10n.recurringReminderTimeValue(overview.reminderTime),
              ),
              trailing: const Icon(Icons.chevron_right_rounded),
              enabled: !stale,
              onTap: () => _pickReminderTime(context, ref),
            ),
          ],
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
