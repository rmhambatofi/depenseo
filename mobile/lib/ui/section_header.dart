import 'package:flutter/material.dart';

import 'tokens.dart';

/// Titre de section hors des cartes, avec icône optionnelle avant le titre et
/// lien optionnel à droite (« Voir tout ») en couleur primaire.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.actionKey,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.xs,
      AppSpacing.lg,
      AppSpacing.xs,
      AppSpacing.sm,
    ),
  });

  final String title;

  /// Icône décorative en couleur primaire avant le titre (réglages).
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Key? actionKey;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (icon != null) ...[
            ExcludeSemantics(child: Icon(icon, color: t.primary, size: 20)),
            const SizedBox(width: AppSpacing.xs),
          ],
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: t.text,
                ),
              ),
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              key: actionKey,
              onPressed: onAction,
              style: TextButton.styleFrom(foregroundColor: t.primary),
              child: Text(actionLabel!),
            ),
        ],
      ),
    );
  }
}
