import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/brand_tile.dart';
import '../auth/auth_controller.dart';
import 'app_lock_controller.dart';
import 'lock_screen.dart';

/// Enveloppe toute l'app (NF-SEC-05, F-AUTH-04) : masque le contenu hors premier plan
/// (sélecteur d'apps) et superpose l'écran de verrouillage sans perdre la navigation.
class LockGate extends ConsumerStatefulWidget {
  const LockGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate>
    with WidgetsBindingObserver {
  late final AppLifecycleListener _lifecycle;
  bool _obscured = false;
  bool _guarded = false;

  @override
  void initState() {
    super.initState();
    // Enregistré avant le routeur (enfant) : consulté en premier pour le bouton retour.
    WidgetsBinding.instance.addObserver(this);
    final state = WidgetsBinding.instance.lifecycleState;
    _obscured = state != null && state != AppLifecycleState.resumed;
    _lifecycle = AppLifecycleListener(
      onHide: () => ref.read(appLockProvider.notifier).didHide(),
      onShow: () => ref.read(appLockProvider.notifier).didShow(),
      onStateChange: (state) =>
          setState(() => _obscured = state != AppLifecycleState.resumed),
    );
  }

  /// Retour Android sous le verrou : consommé, la pile masquée reste intacte.
  @override
  Future<bool> didPopRoute() async => _guarded;

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = switch (ref.watch(authControllerProvider)) {
      AsyncData(value: AuthStatus.signedIn) => true,
      _ => false,
    };
    final lock = ref.watch(appLockProvider);
    // Sans session, rien à protéger (connexion, erreur de coffre) ; la redirection vers
    // /login a lieu dans la même image que la déconnexion (test « 5e échec »).
    final guarded = signedIn && (!lock.ready || lock.locked);
    _guarded = guarded;
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeFocus(
          excluding: guarded,
          child: Offstage(
            offstage: guarded,
            child: TickerMode(enabled: !guarded, child: widget.child),
          ),
        ),
        if (guarded) lock.ready ? const LockScreen() : const _Cover(),
        if (_obscured) const _Cover(key: Key('privacy-cover')),
      ],
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({super.key});

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Theme.of(context).colorScheme.surface,
    child: const Center(child: BrandTile(icon: Icons.lock_rounded)),
  );
}
