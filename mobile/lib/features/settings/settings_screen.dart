import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/lock/lock_settings.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import '../lock/app_lock_controller.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final lock = ref.watch(appLockProvider);
    final controller = ref.read(appLockProvider.notifier);
    final settings = lock.settings;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        children: [
          ListTile(
            key: const Key('open-categories'),
            leading: const Icon(Icons.category_outlined),
            title: Text(l10n.categoriesTitle),
            subtitle: Text(l10n.categoriesSettingsHint),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/categories'),
          ),
          ListTile(
            key: const Key('open-limits'),
            leading: const Icon(Icons.speed_outlined),
            title: Text(l10n.limitsTitle),
            subtitle: Text(l10n.limitsSettingsHint),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/limits'),
          ),
          ListTile(
            title: Text(
              l10n.settingsSecurity,
              style: TextStyle(color: Theme.of(context).colorScheme.primary),
            ),
          ),
          SwitchListTile(
            key: const Key('lock-enabled'),
            title: Text(l10n.lockEnable),
            subtitle: Text(l10n.lockEnableHint),
            value: settings.enabled,
            onChanged: (on) =>
                on ? context.push('/settings/pin') : controller.disable(),
          ),
          if (settings.enabled) ...[
            ListTile(
              title: Text(l10n.lockDelayLabel),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: SegmentedButton<LockDelay>(
                  key: const Key('lock-delay'),
                  segments: [
                    ButtonSegment(
                      value: LockDelay.immediate,
                      label: Text(l10n.lockDelayImmediate),
                    ),
                    ButtonSegment(
                      value: LockDelay.oneMinute,
                      label: Text(l10n.lockDelayOneMinute),
                    ),
                    ButtonSegment(
                      value: LockDelay.fiveMinutes,
                      label: Text(l10n.lockDelayFiveMinutes),
                    ),
                  ],
                  selected: {settings.delay},
                  onSelectionChanged: (s) => controller.setDelay(s.single),
                ),
              ),
            ),
            if (lock.biometricsAvailable)
              SwitchListTile(
                key: const Key('lock-biometrics'),
                title: Text(l10n.lockBiometrics),
                value: settings.biometrics,
                onChanged: (on) =>
                    controller.setBiometrics(on, l10n.lockBiometricReason),
              ),
          ],
          if (ref.watch(screenSecurityProvider).supported)
            SwitchListTile(
              key: const Key('lock-screenshots'),
              title: Text(l10n.lockScreenshots),
              value: settings.blockScreenshots,
              onChanged: controller.setBlockScreenshots,
            ),
        ],
      ),
    );
  }
}
