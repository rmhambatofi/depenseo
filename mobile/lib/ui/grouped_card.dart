import 'package:flutter/material.dart';

import 'app_card.dart';
import 'tokens.dart';

/// Lignes groupées dans une seule carte (réglages, listes courtes), séparées
/// par un filet aligné sur le texte (après la tuile d'icône).
class GroupedCard extends StatelessWidget {
  const GroupedCard({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, child) in children.indexed) ...[
            if (i > 0)
              Divider(
                height: 1,
                thickness: 1,
                indent: AppSizes.rowTextInset,
                endIndent: AppSpacing.md,
                color: t.surfaceHigh,
              ),
            child,
          ],
        ],
      ),
    );
  }
}
