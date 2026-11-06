import 'package:flutter/material.dart';

import '../../core/lock/lock_store.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/tokens.dart';

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

/// Touche ronde du pavé et espace autour (cible ≥ 48, NF-QUA-04).
const double _keySize = 68;
const double _keyGap = 6;

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
    final t = AppTokens.of(context);
    final round = TextButton.styleFrom(
      shape: const CircleBorder(),
      backgroundColor: t.surfaceHigh,
      foregroundColor: t.text,
      padding: EdgeInsets.zero,
      minimumSize: const Size.square(_keySize),
    );
    Widget key(String digit) => Padding(
      padding: const EdgeInsets.all(_keyGap),
      child: SizedBox.square(
        dimension: _keySize,
        child: TextButton(
          key: Key('pin-key-$digit'),
          style: round,
          onPressed: () => _press(digit),
          child: Text(
            digit,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: t.text,
            ),
          ),
        ),
      ),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.prompt,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(color: t.textMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        Semantics(
          label: '${_pin.length}/${LockStore.pinLength}',
          child: Row(
            key: const Key('pin-dots'),
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < LockStore.pinLength; i++)
                Padding(
                  padding: const EdgeInsets.all(6),
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < _pin.length ? t.primary : t.surfaceHigh,
                      border: Border.all(
                        color: i < _pin.length ? t.primary : t.textMuted,
                        width: 1.5,
                      ),
                    ),
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
            const SizedBox.square(dimension: _keySize + 2 * _keyGap),
            key('0'),
            Padding(
              padding: const EdgeInsets.all(_keyGap),
              child: SizedBox.square(
                dimension: _keySize,
                // Pas d'infobulle : l'écran de verrouillage est hors de tout Overlay.
                child: IconButton(
                  key: const Key('pin-delete'),
                  onPressed: _delete,
                  color: t.textMuted,
                  icon: Icon(
                    Icons.backspace_rounded,
                    semanticLabel: l10n.pinDelete,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
