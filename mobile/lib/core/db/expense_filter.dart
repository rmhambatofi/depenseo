import 'package:flutter/foundation.dart' show immutable, setEquals;

/// Critères combinables de la liste des dépenses (F-DEP-09) : texte (note ou
/// commerçant, comme `q` de l'API, ADR-025), montant et période bornes
/// incluses, catégories (une racine inclut ses sous-catégories, ADR-051).
@immutable
class ExpenseFilter {
  const ExpenseFilter({
    this.text = '',
    this.minAmount,
    this.maxAmount,
    this.from,
    this.to,
    this.categoryIds = const {},
  });

  final String text;

  /// Unités mineures (entiers), dans la devise du compte.
  final int? minAmount;
  final int? maxAmount;

  /// Dates calendaires `AAAA-MM-JJ`, comparées comme chaînes (jamais d'instant).
  final String? from;
  final String? to;
  final Set<String> categoryIds;

  String get foldedText => foldForSearch(text.trim());

  /// Aucun critère hors texte (affichage du bouton « Filtres »).
  bool get hasCriteria =>
      minAmount != null ||
      maxAmount != null ||
      from != null ||
      to != null ||
      categoryIds.isNotEmpty;

  bool get isEmpty => !hasCriteria && text.trim().isEmpty;

  /// Période choisie dans les filtres (remplace le mois de la liste).
  bool get hasPeriod => from != null || to != null;

  /// Mêmes critères sur la période [bounds] (`(from, to)` inclus).
  ExpenseFilter withPeriod((String, String) bounds) => ExpenseFilter(
    text: text,
    minAmount: minAmount,
    maxAmount: maxAmount,
    from: bounds.$1,
    to: bounds.$2,
    categoryIds: categoryIds,
  );

  ExpenseFilter withText(String value) => ExpenseFilter(
    text: value,
    minAmount: minAmount,
    maxAmount: maxAmount,
    from: from,
    to: to,
    categoryIds: categoryIds,
  );

  /// Mêmes critères, texte remplacé par celui de [other] (feuille de filtres).
  ExpenseFilter withCriteriaOf(ExpenseFilter other) => ExpenseFilter(
    text: text,
    minAmount: other.minAmount,
    maxAmount: other.maxAmount,
    from: other.from,
    to: other.to,
    categoryIds: other.categoryIds,
  );

  @override
  bool operator ==(Object other) =>
      other is ExpenseFilter &&
      other.text == text &&
      other.minAmount == minAmount &&
      other.maxAmount == maxAmount &&
      other.from == from &&
      other.to == to &&
      setEquals(other.categoryIds, categoryIds);

  @override
  int get hashCode => Object.hash(
    text,
    minAmount,
    maxAmount,
    from,
    to,
    Object.hashAllUnordered(categoryIds),
  );
}

const _folds = {
  'a': 'àáâãäåāăą',
  'c': 'çćĉċč',
  'd': 'ďđ',
  'e': 'èéêëēĕėęě',
  'g': 'ĝğġģ',
  'h': 'ĥħ',
  'i': 'ìíîïĩīĭįı',
  'j': 'ĵ',
  'k': 'ķ',
  'l': 'ĺļľŀł',
  'n': 'ñńņňŉ',
  'o': 'òóôõöøōŏő',
  'r': 'ŕŗř',
  's': 'śŝşšș',
  't': 'ţťŧț',
  'u': 'ùúûüũūŭůűų',
  'w': 'ŵ',
  'y': 'ýÿŷ',
  'z': 'źżž',
  'ae': 'æ',
  'oe': 'œ',
  'ss': 'ß',
};

final _foldMap = {
  for (final MapEntry(:key, :value) in _folds.entries)
    for (final rune in value.runes) rune: key,
};

/// Forme de comparaison insensible à la casse et aux accents (§8.1 :
/// « energie » trouve « Énergie ») ; marques combinantes (NFD) retirées.
String foldForSearch(String input) {
  final out = StringBuffer();
  for (final rune in input.toLowerCase().runes) {
    if (rune >= 0x0300 && rune <= 0x036F) continue;
    out.write(_foldMap[rune] ?? String.fromCharCode(rune));
  }
  return out.toString();
}
