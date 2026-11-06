import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/notifications/notification_api.dart';
import '../../l10n/generated/app_localizations.dart';
import 'push_registration.dart';

/// Réglages lus en ligne à chaque ouverture (ADR-056).
final notificationPrefsProvider = FutureProvider.autoDispose<NotificationPrefs>(
  retry: (_, _) => null,
  (ref) => ref.watch(notificationApiProvider).load(),
);

/// Heure du rappel quotidien proposée à l'activation, et plage de silence par défaut.
const defaultDailyReminderTime = '20:00';
const defaultQuietHours = QuietHours('22:00', '07:00');

/// Réglages par type, plage de silence et rappel quotidien (F-NOT-01/02/04/05).
class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final prefs = ref.watch(notificationPrefsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.notificationsTitle)),
      body: switch (prefs) {
        AsyncValue(:final value?) => _NotificationSettingsForm(initial: value),
        AsyncValue(hasError: true) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(l10n.notificationsOffline, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(
                  key: const Key('notifications-retry'),
                  onPressed: () => ref.invalidate(notificationPrefsProvider),
                  child: Text(l10n.retry),
                ),
              ],
            ),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _NotificationSettingsForm extends ConsumerStatefulWidget {
  const _NotificationSettingsForm({required this.initial});

  final NotificationPrefs initial;

  @override
  ConsumerState<_NotificationSettingsForm> createState() => _FormState();
}

class _FormState extends ConsumerState<_NotificationSettingsForm> {
  late NotificationPrefs _prefs = widget.initial;
  bool _saving = false;

  /// Une écriture à la fois ; en cas d'échec, l'écran garde l'état précédent.
  Future<void> _write(
    Future<NotificationPrefs> Function(NotificationApi api) call,
  ) async {
    if (_saving) return;
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final api = ref.read(notificationApiProvider);
    setState(() => _saving = true);
    try {
      final updated = await call(api);
      if (mounted) setState(() => _prefs = updated);
    } on Object catch (e) {
      final offline = e is NotificationApiException && e.status == null;
      messenger.showSnackBar(
        SnackBar(
          content: Text(offline ? l10n.notificationsOffline : l10n.saveFailed),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setFlag(String field, bool on) =>
      _write((api) => api.updateSettings(_prefs, {field: on}));

  Future<void> _setDailyReminder(bool on) => _write((api) async {
    var prefs = _prefs;
    if (on && !prefs.dailyReminder) {
      prefs = await api.updateSettings(prefs, {'dailyReminder': true});
    }
    return api.setDailyReminderTime(
      prefs,
      on ? prefs.dailyReminderTime ?? defaultDailyReminderTime : null,
    );
  });

  Future<void> _pickDailyTime() async {
    final current = _prefs.dailyReminderTime ?? defaultDailyReminderTime;
    final time = await _pickTime(current);
    if (!mounted || time == null || time == current) return;
    await _write((api) => api.setDailyReminderTime(_prefs, time));
  }

  Future<void> _setQuiet(QuietHours? quiet) {
    if (quiet != null && quiet.start == quiet.end) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(l10n.notificationsQuietInvalid)));
      return Future.value();
    }
    return _write(
      (api) => api.updateSettings(_prefs, {'quietHours': quiet?.toJson()}),
    );
  }

  Future<void> _pickQuiet({required bool start}) async {
    final quiet = _prefs.quietHours ?? defaultQuietHours;
    final time = await _pickTime(start ? quiet.start : quiet.end);
    if (!mounted || time == null) return;
    final next = start
        ? QuietHours(time, quiet.end)
        : QuietHours(quiet.start, time);
    if (next == quiet) return;
    await _setQuiet(next);
  }

  Future<String?> _pickTime(String current) async {
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      initialEntryMode: TimePickerEntryMode.input,
      // La saisie interprète l'heure en 12 h si l'appareil n'impose pas le
      // 24 h, même quand la langue l'affiche (fr : « 07 » à partir de 20:00
      // donnait 19:00) : on aligne la saisie sur le format affiché.
      builder: (context, child) {
        final media = MediaQuery.of(context);
        final format = MaterialLocalizations.of(
          context,
        ).timeOfDayFormat(alwaysUse24HourFormat: media.alwaysUse24HourFormat);
        return MediaQuery(
          data: media.copyWith(
            alwaysUse24HourFormat: hourFormat(of: format) != HourFormat.h,
          ),
          child: child!,
        );
      },
      initialTime: TimeOfDay(
        hour: int.parse(parts[0]),
        minute: int.parse(parts[1]),
      ),
    );
    if (picked == null) return null;
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(picked.hour)}:${two(picked.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final prefs = _prefs;
    final enabled = !_saving;
    final quiet = prefs.quietHours;
    final header = TextStyle(color: Theme.of(context).colorScheme.primary);
    return ListView(
      children: [
        ListTile(title: Text(l10n.notificationsTypes, style: header)),
        SwitchListTile(
          key: const Key('notif-limit'),
          title: Text(l10n.notificationsLimit),
          subtitle: Text(l10n.notificationsLimitHint),
          value: prefs.limit,
          onChanged: enabled ? (on) => _setFlag('limit', on) : null,
        ),
        SwitchListTile(
          key: const Key('notif-occurrence'),
          title: Text(l10n.notificationsOccurrence),
          subtitle: Text(l10n.notificationsOccurrenceHint),
          value: prefs.occurrence,
          onChanged: enabled ? (on) => _setFlag('occurrence', on) : null,
        ),
        SwitchListTile(
          key: const Key('notif-unusual'),
          title: Text(l10n.notificationsUnusual),
          subtitle: Text(l10n.notificationsUnusualHint),
          value: prefs.unusualExpense,
          onChanged: enabled ? (on) => _setFlag('unusualExpense', on) : null,
        ),
        SwitchListTile(
          key: const Key('notif-daily'),
          title: Text(l10n.notificationsDaily),
          subtitle: Text(l10n.notificationsDailyHint),
          value: prefs.dailyReminderOn,
          onChanged: enabled ? _setDailyReminder : null,
        ),
        if (prefs.dailyReminderOn)
          ListTile(
            key: const Key('notif-daily-time'),
            leading: const Icon(Icons.schedule_rounded),
            title: Text(l10n.notificationsDailyTime),
            subtitle: Text(prefs.dailyReminderTime!),
            enabled: enabled,
            onTap: _pickDailyTime,
          ),
        ListTile(title: Text(l10n.notificationsQuiet, style: header)),
        SwitchListTile(
          key: const Key('notif-quiet'),
          title: Text(l10n.notificationsQuietEnable),
          subtitle: Text(l10n.notificationsQuietHint),
          value: quiet != null,
          onChanged: enabled
              ? (on) => _setQuiet(on ? defaultQuietHours : null)
              : null,
        ),
        if (quiet != null) ...[
          ListTile(
            key: const Key('notif-quiet-start'),
            leading: const Icon(Icons.bedtime_rounded),
            title: Text(l10n.notificationsQuietStart),
            subtitle: Text(quiet.start),
            enabled: enabled,
            onTap: () => _pickQuiet(start: true),
          ),
          ListTile(
            key: const Key('notif-quiet-end'),
            leading: const Icon(Icons.wb_sunny_rounded),
            title: Text(l10n.notificationsQuietEnd),
            subtitle: Text(quiet.end),
            enabled: enabled,
            onTap: () => _pickQuiet(start: false),
          ),
        ],
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            l10n.notificationsNoAmount,
            key: const Key('notif-no-amount'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}
