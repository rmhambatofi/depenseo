import 'package:flutter/material.dart';

import 'tokens.dart';

/// Tailles de montant de la charte.
enum AmountSize {
  /// Carte d'en-tête de l'accueil.
  hero(40, FontWeight.w700),

  /// Montant principal d'une carte.
  card(28, FontWeight.w700),

  /// Ligne de liste.
  list(17, FontWeight.w600);

  const AmountSize(this.fontSize, this.weight);

  final double fontSize;
  final FontWeight weight;
}

/// Montant déjà formaté (le formatage reste dans `core/money`), en chiffres
/// tabulaires pour que les colonnes s'alignent.
class AmountText extends StatelessWidget {
  const AmountText(
    this.text, {
    super.key,
    this.size = AmountSize.list,
    this.color,
    this.textAlign,
  });

  final String text;
  final AmountSize size;

  /// Couleur imposée (dépassement…) ; couleur du texte par défaut.
  final Color? color;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) => Text(
    text,
    textAlign: textAlign,
    style: TextStyle(
      fontSize: size.fontSize,
      fontWeight: size.weight,
      color: color ?? AppTokens.of(context).text,
      fontFeatures: const [FontFeature.tabularFigures()],
    ),
  );
}
