import 'package:flutter/material.dart';

import 'tokens.dart';

/// Barre de consommation d'une limite : arrondie, verte sous la limite, rouge
/// à partir de 100 %. Le pourcentage vient de l'API (invariant 8) ; la barre
/// est plafonnée à 100 %, le dépassement est dit par le texte voisin, à
/// fusionner dans le même nœud sémantique.
class LimitProgressBar extends StatelessWidget {
  const LimitProgressBar({
    super.key,
    required this.consumedPercent,
    required this.semanticsLabel,
  });

  final int consumedPercent;
  final String semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    return LinearProgressIndicator(
      value: consumedPercent.clamp(0, 100) / 100,
      minHeight: 8,
      borderRadius: BorderRadius.circular(4),
      semanticsLabel: semanticsLabel,
      color: consumedPercent >= 100 ? t.danger : t.success,
      backgroundColor: t.surfaceHigh,
    );
  }
}
