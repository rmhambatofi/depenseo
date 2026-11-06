import 'package:flutter/material.dart';

import 'tokens.dart';

/// Tuile de marque des écrans d'entrée (connexion, inscription, verrouillage) :
/// carré arrondi en dégradé primaire, icône blanche. Décorative.
class BrandTile extends StatelessWidget {
  const BrandTile({
    super.key,
    this.icon = Icons.account_balance_wallet_rounded,
    this.size = 64,
  });

  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: t.primaryGradient,
          borderRadius: BorderRadius.circular(AppRadius.card * size / 64),
          boxShadow: t.cardShadow,
        ),
        child: Icon(icon, color: t.onGradient, size: size * 0.5),
      ),
    );
  }
}
