import 'package:flutter/material.dart';

import 'tokens.dart';

/// Tuile d'icône : carré arrondi teinté (15 % en clair, 25 % en sombre),
/// icône pleine dans la couleur saturée. Sans [icon], affiche [fallbackText]
/// (emoji d'une catégorie hors catalogue, ADR-069). Décorative : le libellé
/// voisin porte le sens pour les lecteurs d'écran.
class IconTile extends StatelessWidget {
  const IconTile({
    super.key,
    this.icon,
    this.fallbackText,
    this.color,
    this.size = 48,
  }) : assert(icon != null || fallbackText != null);

  final IconData? icon;
  final String? fallbackText;

  /// Couleur saturée ; couleur primaire par défaut.
  final Color? color;

  /// Côté de la tuile (48–56 selon la charte).
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = color ?? t.primary;
    final glyph = size * 0.5;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: c.withValues(alpha: dark ? 0.25 : 0.15),
          borderRadius: BorderRadius.circular(AppRadius.tile),
        ),
        child: icon != null
            ? Icon(icon, color: c, size: glyph)
            : Text(
                fallbackText!,
                maxLines: 1,
                overflow: TextOverflow.clip,
                textScaler: TextScaler.noScaling,
                style: TextStyle(fontSize: glyph * 0.9, color: t.text),
              ),
      ),
    );
  }
}
