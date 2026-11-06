import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/lock/lock_settings.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import '../../ui/grouped_card.dart';
import '../../ui/icon_tile.dart';
import '../../ui/section_header.dart';
import '../../ui/tokens.dart';
import '../lock/app_lock_controller.dart';
import 'theme_mode_controller.dart';

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
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          0,
          AppSpacing.md,
          AppSpacing.lg,
        ),
        children: [
          SectionHeader(title: l10n.settingsGeneral, icon: Icons.tune_rounded),
          GroupedCard(
            children: [
              ListTile(
                key: const Key('open-categories'),
                leading: const IconTile(
                  icon: Icons.category_rounded,
                  size: AppSizes.rowTile,
                ),
                title: Text(l10n.categoriesTitle),
                subtitle: Text(l10n.categoriesSettingsHint),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/settings/categories'),
              ),
              ListTile(
                key: const Key('open-notifications'),
                leading: const IconTile(
                  icon: Icons.notifications_rounded,
                  size: AppSizes.rowTile,
                ),
                title: Text(l10n.notificationsTitle),
                subtitle: Text(l10n.notificationsSettingsHint),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/settings/notifications'),
              ),
            ],
          ),
          SectionHeader(
            title: l10n.settingsSecurity,
            icon: Icons.shield_rounded,
          ),
          GroupedCard(
            children: [
              SwitchListTile(
                key: const Key('lock-enabled'),
                secondary: const IconTile(
                  icon: Icons.lock_rounded,
                  size: AppSizes.rowTile,
                ),
                title: Text(l10n.lockEnable),
                subtitle: Text(l10n.lockEnableHint),
                value: settings.enabled,
                onChanged: (on) =>
                    on ? context.push('/settings/pin') : controller.disable(),
              ),
              if (settings.enabled) ...[
                ListTile(
                  leading: const IconTile(
                    icon: Icons.timer_rounded,
                    size: AppSizes.rowTile,
                  ),
                  title: Text(l10n.lockDelayLabel),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
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
                    secondary: const IconTile(
                      icon: Icons.fingerprint_rounded,
                      size: AppSizes.rowTile,
                    ),
                    title: Text(l10n.lockBiometrics),
                    value: settings.biometrics,
                    onChanged: (on) =>
                        controller.setBiometrics(on, l10n.lockBiometricReason),
                  ),
              ],
              if (ref.watch(screenSecurityProvider).supported)
                SwitchListTile(
                  key: const Key('lock-screenshots'),
                  secondary: const IconTile(
                    icon: Icons.screenshot_rounded,
                    size: AppSizes.rowTile,
                  ),
                  title: Text(l10n.lockScreenshots),
                  value: settings.blockScreenshots,
                  onChanged: controller.setBlockScreenshots,
                ),
            ],
          ),
          SectionHeader(
            title: l10n.settingsAppearance,
            icon: Icons.palette_rounded,
          ),
          GroupedCard(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.xs,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: AppSpacing.xs,
                  children: [
                    SegmentedButton<ThemeMode>(
                      key: const Key('theme-mode'),
                      showSelectedIcon: false,
                      segments: [
                        ButtonSegment(
                          value: ThemeMode.light,
                          icon: const Icon(Icons.light_mode_rounded),
                          label: Text(l10n.themeLight),
                        ),
                        ButtonSegment(
                          value: ThemeMode.system,
                          icon: const Icon(Icons.brightness_auto_rounded),
                          label: Text(l10n.themeAuto),
                        ),
                        ButtonSegment(
                          value: ThemeMode.dark,
                          icon: const Icon(Icons.dark_mode_rounded),
                          label: Text(l10n.themeDark),
                        ),
                      ],
                      selected: {ref.watch(themeModeProvider)},
                      onSelectionChanged: (s) =>
                          ref.read(themeModeProvider.notifier).set(s.single),
                    ),
                    Text(
                      l10n.themeHint,
                      style: TextStyle(color: AppTokens.of(context).textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SectionHeader(title: l10n.accountTitle, icon: Icons.person_rounded),
          GroupedCard(
            children: [
              ListTile(
                key: const Key('open-account'),
                leading: const IconTile(
                  icon: Icons.person_rounded,
                  size: AppSizes.rowTile,
                ),
                title: Text(l10n.accountTitle),
                subtitle: Text(l10n.accountSettingsHint),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/settings/account'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
