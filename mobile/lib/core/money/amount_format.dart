import 'package:intl/intl.dart';

import 'amount_input.dart';

/// Affiche un montant en unités mineures (entier) selon la langue, sans
/// passer par un flottant : partie entière groupée par `intl`, décimales
/// découpées sur l'entier (table ISO 4217 de [minorUnits]).
String formatAmount(int minor, String currency, String locale) {
  final digits = minorUnits[currency] ?? 2;
  var factor = 1;
  for (var i = 0; i < digits; i++) {
    factor *= 10;
  }
  final whole = NumberFormat.decimalPattern(locale).format(minor ~/ factor);
  final symbols = NumberFormat.decimalPattern(locale).symbols;
  final number = digits == 0
      ? whole
      : '$whole${symbols.DECIMAL_SEP}'
            '${(minor % factor).toString().padLeft(digits, '0')}';
  final simple = NumberFormat.simpleCurrency(
    locale: locale,
    name: currency,
  ).currencySymbol;
  // Symbole typographique (€, £, ¥…) sinon code ISO : « kr » ou « din »
  // ne distinguent pas les devises.
  final symbol = RegExp(r'\p{L}', unicode: true).hasMatch(simple)
      ? currency
      : simple;
  final pattern = symbols.CURRENCY_PATTERN;
  if (pattern.startsWith('¤')) {
    // « ¤ #,##0.00 » (nl…) : espace insécable après le symbole.
    final spaced = RegExp(r'^¤\s').hasMatch(pattern);
    return spaced ? '$symbol\u00a0$number' : '$symbol$number';
  }
  // Espace insécable entre le nombre et le symbole (motif « #,##0.00 ¤ »).
  return '$number $symbol';
}
