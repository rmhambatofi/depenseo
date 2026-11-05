import 'package:depenseo/core/money/amount_input.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

int? cents(String input, [String currency = 'EUR']) =>
    switch (parseAmountInput(input, currency)) {
      AmountOk(:final cents) => cents,
      AmountError() => null,
    };

AmountErrorKind? error(String input, [String currency = 'EUR']) =>
    switch (parseAmountInput(input, currency)) {
      AmountOk() => null,
      AmountError(:final kind) => kind,
    };

void main() {
  group('parseAmountInput (règles de packages/shared, ADR-011)', () {
    test('virgule et point acceptés (F-DEP-02, NF-FMT-06)', () {
      expect(cents('12.5'), 1250);
      expect(cents('12,5'), 1250);
      expect(cents('12,50'), 1250);
      expect(cents('12'), 1200);
      expect(cents('.5'), 50);
      expect(cents('0,07'), 7);
    });

    test('espaces de groupement par trois chiffres', () {
      expect(cents('1 234,56'), 123456);
      expect(cents('1 234,56'), 123456);
      expect(cents('1 234 567'), 123456700);
      expect(error('12 34'), AmountErrorKind.invalid);
    });

    test('espaces en bordure ignorés', () {
      expect(cents('  8,20 '), 820);
    });

    test('décimales selon la devise (table ISO 4217 figée)', () {
      expect(cents('1500', 'JPY'), 1500);
      expect(error('15,5', 'JPY'), AmountErrorKind.tooManyDecimals);
      expect(cents('1,234', 'TND'), 1234);
      expect(error('1,234'), AmountErrorKind.tooManyDecimals);
    });

    test('refus', () {
      expect(error(''), AmountErrorKind.empty);
      expect(error('   '), AmountErrorKind.empty);
      expect(error('-5'), AmountErrorKind.invalid);
      expect(error('+5'), AmountErrorKind.invalid);
      expect(error('5,'), AmountErrorKind.invalid);
      expect(error('1.234,56'), AmountErrorKind.invalid);
      expect(error('1,234.56'), AmountErrorKind.invalid);
      expect(error('12a'), AmountErrorKind.invalid);
      expect(error('1' * 41), AmountErrorKind.tooLarge);
    });

    test('zéro et dépassement des bornes de l\'API', () {
      expect(error('0'), AmountErrorKind.notPositive);
      expect(error('0,00'), AmountErrorKind.notPositive);
      expect(cents('999999999,99'), 99999999999);
      expect(error('1000000000'), AmountErrorKind.tooLarge);
      expect(error('9' * 30), AmountErrorKind.tooLarge);
    });

    test('devise inconnue refusée', () {
      expect(() => parseAmountInput('1', 'XXX'), throwsArgumentError);
    });
  });

  group('AmountInputFormatter', () {
    TextEditingValue format(String separator, String typed) =>
        AmountInputFormatter(separator).formatEditUpdate(
          TextEditingValue.empty,
          TextEditingValue(
            text: typed,
            selection: TextSelection.collapsed(offset: typed.length),
          ),
        );

    test('en français, le point saisi devient une virgule', () {
      expect(format(',', '12.5').text, '12,5');
      expect(format(',', '12,5').text, '12,5');
    });

    test('en anglais, la virgule saisie devient un point', () {
      expect(format('.', '12,5').text, '12.5');
    });

    test('caractères hors montant retirés', () {
      expect(format(',', '1a2-€').text, '12');
      expect(format(',', '1 234').text, '1 234');
    });
  });
}
