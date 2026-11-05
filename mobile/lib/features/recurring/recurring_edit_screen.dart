import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import 'recurring_form.dart';
import 'recurring_providers.dart';

/// Création ([recurringId] nul) ou modification d'une dépense récurrente
/// (F-REC-01/02/04, ADR-054). Fréquence et première échéance immuables.
class RecurringEditScreen extends ConsumerWidget {
  const RecurringEditScreen({super.key, this.recurringId});

  final String? recurringId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(recurringOverviewProvider);
    final id = recurringId;
    final editing = switch (state) {
      AsyncValue(:final value?) when id != null => value.byId(id),
      _ => null,
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(id == null ? l10n.recurringAdd : l10n.recurringEditTitle),
      ),
      body: switch (state) {
        // Récurrence introuvable (supprimée ailleurs) : rien à modifier.
        AsyncValue(:final value?) when id == null || editing != null =>
          RecurringForm(
            // Formulaire lu une fois : un rechargement ne l'écrase pas.
            key: ValueKey(id ?? 'new'),
            data: value,
            editing: editing,
            // Données peut-être périmées : pas d'écriture (ADR-054).
            enabled: !state.hasError,
          ),
        AsyncValue(hasValue: true) => Padding(
          padding: const EdgeInsets.all(24),
          child: Text(l10n.recurringConflict, key: const Key('recurring-gone')),
        ),
        AsyncError() => Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            l10n.recurringOffline,
            key: const Key('recurring-offline'),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}
