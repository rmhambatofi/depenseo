import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../ui/app_card.dart';
import '../../ui/brand_tile.dart';
import '../../ui/tokens.dart';
import 'app_lock_controller.dart';
import 'pin_pad.dart';

/// Écran de verrouillage, posé au-dessus du routeur (hors navigateur : pas de dialogue).
class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key = const Key('lock-screen')});

  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  String? _error;
  bool _confirmForgot = false;
  bool _prompting = false;
  AppLifecycleListener? _lifecycle;

  @override
  void initState() {
    super.initState();
    // Invite biométrique seulement app active : iOS/Android l'annulent sinon.
    final state = WidgetsBinding.instance.lifecycleState;
    if (state == null || state == AppLifecycleState.resumed) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _biometrics());
    } else {
      _lifecycle = AppLifecycleListener(
        onResume: () {
          _lifecycle?.dispose();
          _lifecycle = null;
          _biometrics();
        },
      );
    }
  }

  @override
  void dispose() {
    _lifecycle?.dispose();
    super.dispose();
  }

  bool get _biometricsOffered {
    final lock = ref.read(appLockProvider);
    return lock.settings.biometrics && lock.biometricsAvailable;
  }

  Future<void> _biometrics() async {
    if (!mounted || !_biometricsOffered || _prompting) return;
    _prompting = true;
    try {
      await ref
          .read(appLockProvider.notifier)
          .unlockWithBiometrics(
            AppLocalizations.of(context).lockBiometricReason,
          );
    } finally {
      _prompting = false;
    }
  }

  Future<void> _submit(String pin) async {
    final l10n = AppLocalizations.of(context);
    final controller = ref.read(appLockProvider.notifier);
    final PinResult result;
    try {
      result = await controller.unlockWithPin(pin);
    } on Exception {
      if (mounted) setState(() => _error = l10n.errorUnknown);
      return;
    }
    if (!mounted || result != PinResult.wrong) return;
    setState(
      () => _error = l10n.lockWrongPin(
        ref.read(appLockProvider).remainingAttempts,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: _confirmForgot ? _forgot(l10n) : _unlock(l10n),
          ),
        ),
      ),
    );
  }

  Widget _unlock(AppLocalizations l10n) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      const BrandTile(icon: Icons.lock_rounded),
      const SizedBox(height: AppSpacing.md),
      Semantics(
        header: true,
        child: Text(
          l10n.lockTitle,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      const SizedBox(height: AppSpacing.lg),
      PinPad(prompt: l10n.lockPrompt, error: _error, onCompleted: _submit),
      if (_biometricsOffered)
        TextButton.icon(
          key: const Key('lock-biometrics-retry'),
          onPressed: _biometrics,
          icon: const Icon(Icons.fingerprint_rounded),
          label: Text(l10n.lockUseBiometrics),
        ),
      TextButton(
        key: const Key('lock-forgot'),
        onPressed: () => setState(() => _confirmForgot = true),
        child: Text(l10n.lockForgot),
      ),
    ],
  );

  Widget _forgot(AppLocalizations l10n) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      const BrandTile(icon: Icons.lock_reset_rounded),
      const SizedBox(height: AppSpacing.md),
      Semantics(
        header: true,
        child: Text(
          l10n.lockForgot,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      const SizedBox(height: AppSpacing.md),
      AppCard(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Text(l10n.lockForgotBody, textAlign: TextAlign.center),
      ),
      const SizedBox(height: AppSpacing.lg),
      FilledButton(
        key: const Key('lock-forgot-confirm'),
        onPressed: () => ref.read(appLockProvider.notifier).forgetAndSignOut(),
        child: Text(l10n.logout),
      ),
      TextButton(
        onPressed: () => setState(() => _confirmForgot = false),
        child: Text(l10n.cancel),
      ),
    ],
  );
}
