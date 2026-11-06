import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../ui/tokens.dart';
import '../expenses/expense_providers.dart';
import '../limits/limit_providers.dart';
import '../recurring/recurring_providers.dart';
import '../sync/sync_controller.dart';

/// Onglets de la coquille, dans l'ordre des branches du routeur.
enum AppTab { home, expenses, limits, recurring }

/// Coquille des écrans principaux : barre du bas (Accueil, Dépenses, « + »
/// central, Limites, Récurrentes). Les écrans poussés par-dessus (saisie,
/// réglages, formulaires) la masquent.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    // Prépare le contexte du compte avant le premier « + » (saisie en < 10 s).
    ref.watch(accountContextProvider);
    final current = navigationShell.currentIndex;
    final selected = current < _addSlot ? current : current + 1;
    // Retour système hors de l'Accueil : revenir à l'Accueil plutôt que
    // quitter l'application.
    return PopScope(
      canPop: current == AppTab.home.index,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) openTab(ref, navigationShell, AppTab.home);
      },
      child: Scaffold(
        body: navigationShell,
        bottomNavigationBar: NavigationBar(
          selectedIndex: selected,
          onDestinationSelected: (i) {
            if (i == _addSlot) return;
            final tab = AppTab.values[i < _addSlot ? i : i - 1];
            openTab(ref, navigationShell, tab);
          },
          destinations: [
            NavigationDestination(
              key: const Key('open-home'),
              icon: const Icon(Icons.home_rounded),
              label: l10n.navHome,
            ),
            NavigationDestination(
              key: const Key('open-expenses'),
              icon: const Icon(Icons.receipt_long_rounded),
              label: l10n.navExpenses,
            ),
            const _AddExpenseButton(),
            NavigationDestination(
              key: const Key('open-limits'),
              icon: const Icon(Icons.speed_rounded),
              label: l10n.navLimits,
            ),
            NavigationDestination(
              key: const Key('open-recurring'),
              icon: const Icon(Icons.event_repeat_rounded),
              label: l10n.navRecurring,
            ),
          ],
        ),
      ),
    );
  }
}

/// Place du « + » dans la barre : il n'est pas un onglet (les lecteurs d'écran
/// comptent cinq éléments pour quatre onglets, accepté).
const _addSlot = 2;

/// Affiche [tab]. Un nouvel onglet Limites ou Récurrentes relit ses données
/// en ligne (le contenu reste affiché pendant la lecture) ; toucher l'onglet
/// courant revient à sa racine.
void openTab(WidgetRef ref, StatefulNavigationShell shell, AppTab tab) {
  final index = tab.index;
  final same = index == shell.currentIndex;
  if (!same && tab == AppTab.limits) ref.invalidate(limitOverviewProvider);
  if (!same && tab == AppTab.recurring) {
    ref.invalidate(recurringOverviewProvider);
  }
  shell.goBranch(index, initialLocation: same);
}

/// « + » central (F-DEP-01) : saisie rapide plein écran, puis confirmation.
class _AddExpenseButton extends ConsumerWidget {
  const _AddExpenseButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    void add() => _add(context, ref, l10n);
    return Center(
      // Annoncé comme bouton (l'`InkWell` seul ne l'est pas).
      child: Semantics(
        button: true,
        label: l10n.addExpense,
        onTap: add,
        excludeSemantics: true,
        child: Tooltip(
          message: l10n.addExpense,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: t.primaryGradient,
              boxShadow: t.cardShadow,
            ),
            child: Material(
              type: MaterialType.transparency,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: const Key('add-expense'),
                onTap: add,
                child: SizedBox.square(
                  dimension: 56,
                  child: Icon(Icons.add_rounded, size: 30, color: t.onGradient),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _add(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
  ) async {
    // Préchargement échoué (hors ligne au lancement) : nouvel essai.
    if (ref.read(accountContextProvider).hasError) {
      ref.invalidate(accountContextProvider);
    }
    // Lus avant l'`await` : la coquille peut être démontée entre-temps.
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final saved = await context.push<bool>('/expenses/new');
    if (saved != true) return;
    refreshLocalExpenses(container.invalidate);
    container.read(syncControllerProvider.notifier).request().ignore();
    if (!context.mounted) return;
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(l10n.expenseSaved)));
  }
}
