import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import '../lock/app_lock_controller.dart';
import '../lock/pin_pad.dart';

/// Choix du code : saisi deux fois, puis le verrou est activé.
class PinSetupScreen extends ConsumerStatefulWidget {
  const PinSetupScreen({super.key});

  @override
  ConsumerState<PinSetupScreen> createState() => _PinSetupScreenState();
}

class _PinSetupScreenState extends ConsumerState<PinSetupScreen> {
  String? _first;
  bool _mismatch = false;

  Future<void> _completed(String pin) async {
    final first = _first;
    if (first == null) {
      setState(() {
        _first = pin;
        _mismatch = false;
      });
      return;
    }
    if (first != pin) {
      setState(() {
        _first = null;
        _mismatch = true;
      });
      return;
    }
    await ref.read(appLockProvider.notifier).enable(pin);
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.pinSetupTitle)),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: PinPad(
            // Nouvelle instance à chaque étape : la saisie repart de zéro.
            key: ValueKey(_first == null),
            prompt: _first == null ? l10n.pinSetupPrompt : l10n.pinSetupConfirm,
            error: _mismatch ? l10n.pinSetupMismatch : null,
            onCompleted: _completed,
          ),
        ),
      ),
    );
  }
}
