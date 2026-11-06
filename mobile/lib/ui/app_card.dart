import 'package:flutter/material.dart';

import 'tokens.dart';

/// Carte de la charte : surface arrondie sans bordure, ombre douce en clair.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.md),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  /// Carte cliquable : ondulation contenue dans l'arrondi.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    final radius = BorderRadius.circular(AppRadius.card);
    // Conteneur sémantique (comme `Card`) : le contenu d'une carte n'est pas
    // fusionné avec ses voisines dans une liste.
    return Semantics(
      container: true,
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: radius,
          boxShadow: t.cardShadow,
        ),
        child: Material(
          type: MaterialType.transparency,
          child: onTap == null
              ? Padding(padding: padding, child: child)
              : InkWell(
                  borderRadius: radius,
                  onTap: onTap,
                  child: Padding(padding: padding, child: child),
                ),
        ),
      ),
    );
  }
}
