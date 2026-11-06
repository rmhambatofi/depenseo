import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../ui/tokens.dart';

/// Avatar d'en-tête des onglets : ouvre les réglages (compte compris).
/// Aucune donnée personnelle affichée.
class AccountAvatarButton extends StatelessWidget {
  const AccountAvatarButton({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: IconButton(
        key: const Key('open-settings'),
        tooltip: l10n.accountMenu,
        onPressed: () => context.push('/settings'),
        icon: CircleAvatar(
          radius: 18,
          backgroundColor: t.surfaceHigh,
          child: Icon(Icons.person_rounded, color: t.primary),
        ),
      ),
    );
  }
}
