import 'package:flutter/material.dart';

import '../../core/lock/lock_store.dart';
import '../../l10n/generated/app_localizations.dart';

/// Pavé numérique de saisie du code (sans clavier système ni champ de texte copiable).
class PinPad extends StatefulWidget {
  const PinPad({
    super.key,
    required this.prompt,
    required this.onCompleted,
    this.error,
  });

  final String prompt;
  final String? error;

  /// Appelé une fois les 6 chiffres saisis ; la saisie est vidée ensuite.
  final Future<void> Function(String pin) onCompleted;

  @override
  State<PinPad> createState() => _PinPadState();
}

class _PinPadState extends State<PinPad> {
  String _pin = '';
  bool _busy = false;

  Future<void> _press(String digit) async {
    if (_busy || _pin.length >= LockStore.pinLength) return;
    setState(() => _pin += digit);
    if (_pin.length < LockStore.pinLength) return;
    _busy = true;
    try {
      await widget.onCompleted(_pin);
    } finally {
      _busy = false;
      if (mounted) setState(() => _pin = '');
    }
  }

  void _delete() {
    if (_busy || _pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    Widget key(String digit) => SizedBox(
      width: 72,
      height: 72,
      child: TextButton(
        key: Key('pin-key-$digit'),
        onPressed: () => _press(digit),
        child: Text(digit, style: theme.textTheme.headlineMedium),
      ),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(widget.prompt, style: theme.textTheme.titleMedium),
        const SizedBox(height: 16),
        Semantics(
          label: '${_pin.length}/${LockStore.pinLength}',
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < LockStore.pinLength; i++)
                Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(
                    i < _pin.length ? Icons.circle : Icons.circle_outlined,
                    size: 14,
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: 48,
          child: Center(
            child: Text(
              widget.error ?? '',
              textAlign: TextAlign.center,
              style: TextStyle(color: theme.colorScheme.error),
            ),
          ),
        ),
        for (final row in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ])
          Row(mainAxisSize: MainAxisSize.min, children: row.map(key).toList()),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(width: 72),
            key('0'),
            SizedBox(
              width: 72,
              height: 72,
              // Pas d'infobulle : l'écran de verrouillage est hors de tout Overlay.
              child: IconButton(
                key: const Key('pin-delete'),
                onPressed: _delete,
                icon: Icon(
                  Icons.backspace_rounded,
                  semanticLabel: l10n.pinDelete,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
