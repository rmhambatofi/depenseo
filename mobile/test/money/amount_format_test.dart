import 'package:depenseo/core/money/amount_format.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting());

  // Espaces des groupes et avant le symbole selon CLDR : normalisées pour la lecture.
  String plain(String s) => s.replaceAll(RegExp('[  ]'), ' ');

  test('unités mineures selon la devise, sans flottant', () {
    expect(plain(formatAmount(125050, 'EUR', 'fr')), '1 250,50 €');
    expect(formatAmount(125050, 'EUR', 'en'), '€1,250.50');
    expect(plain(formatAmount(1250, 'JPY', 'fr')), '1 250 ¥');
    expect(plain(formatAmount(12345, 'TND', 'fr')), '12,345 TND');
    expect(plain(formatAmount(7, 'EUR', 'fr')), '0,07 €');
    expect(plain(formatAmount(1000, 'SEK', 'fr')), '10,00 SEK');
  });

  test('espace insécable entre nombre et symbole, avant ou après', () {
    expect(formatAmount(125050, 'EUR', 'fr'), endsWith('50\u00a0€'));
    expect(formatAmount(125050, 'EUR', 'nl'), '€\u00a01.250,50');
  });

  test('plafond API exact (pas d’arrondi binaire)', () {
    expect(formatAmount(99999999999, 'EUR', 'en'), '€999,999,999.99');
  });
}
