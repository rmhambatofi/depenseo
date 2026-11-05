import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import 'auth_controller.dart';
import 'auth_widgets.dart';

/// Trousseau / Keystore illisible au démarrage : pas de session devinée, nouvel essai manuel.
class StorageErrorScreen extends ConsumerWidget {
  const StorageErrorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return AuthScaffold(
      title: l10n.storageErrorTitle,
      children: [
        Text(l10n.storageErrorBody),
        FilledButton(
          onPressed: () => ref.read(authControllerProvider.notifier).retry(),
          child: Text(l10n.retry),
        ),
      ],
    );
  }
}
