import 'package:flutter/services.dart';

/// Décimales par devise : table ISO 4217 figée, copie de `packages/shared/src/currency.ts`
/// (jamais Intl/ICU : le nombre de décimales fixe la valeur entière stockée).
const minorUnits = <String, int>{
  'EUR': 2,
  'CHF': 2,
  'GBP': 2,
  'USD': 2,
  'CAD': 2,
  'SEK': 2,
  'NOK': 2,
  'DKK': 2,
  'PLN': 2,
  'CZK': 2,
  'HUF': 2,
  'RON': 2,
  'ISK': 0,
  'MAD': 2,
  'TND': 3,
  'MGA': 2,
  'MUR': 2,
  'XOF': 0,
  'XAF': 0,
  'XPF': 0,
  'JPY': 0,
};

/// Borne haute acceptée par l'API (`CreateExpenseDto.amount`).
const maxAmount = 99999999999;

enum AmountErrorKind { empty, invalid, tooManyDecimals, tooLarge, notPositive }

sealed class AmountParse {
  const AmountParse();
}

class AmountOk extends AmountParse {
  const AmountOk(this.cents);

  /// Unités mineures (entier exact, jamais de flottant).
  final int cents;
}

class AmountError extends AmountParse {
  const AmountError(this.kind);

  final AmountErrorKind kind;
}

const _spaces = '    ';
final _shape = RegExp(
  '^(?:(\\d{1,3}(?:[$_spaces]\\d{3})+)|(\\d*))(?:[.,](\\d+))?\$',
);

/// Analyse une saisie de montant (mêmes règles que `parseAmountInput` de
/// `packages/shared`, ADR-011) : un seul séparateur décimal, virgule ou point ;
/// espaces seulement entre groupes de trois chiffres ; pas de signe. Refuse en
/// plus les montants nuls et ceux au-delà de la borne de l'API.
AmountParse parseAmountInput(String input, String currency) {
  final decimals = minorUnits[currency];
  if (decimals == null) throw ArgumentError.value(currency, 'currency');
  final text = input.trim();
  if (text.isEmpty) return const AmountError(AmountErrorKind.empty);
  if (text.length > 40) return const AmountError(AmountErrorKind.tooLarge);
  final match = _shape.firstMatch(text);
  if (match == null) return const AmountError(AmountErrorKind.invalid);
  final grouped = match.group(1);
  final integer = (grouped ?? match.group(2)!).replaceAll(
    RegExp('[$_spaces]'),
    '',
  );
  final fraction = match.group(3) ?? '';
  if (integer.isEmpty && fraction.isEmpty) {
    return const AmountError(AmountErrorKind.invalid);
  }
  if (fraction.length > decimals) {
    return const AmountError(AmountErrorKind.tooManyDecimals);
  }
  final digits =
      '${integer.isEmpty ? '0' : integer}${fraction.padRight(decimals, '0')}'
          .replaceFirst(RegExp('^0+(?=\\d)'), '');
  if (digits.length > maxAmount.toString().length) {
    return const AmountError(AmountErrorKind.tooLarge);
  }
  final cents = int.parse(digits);
  if (cents > maxAmount) return const AmountError(AmountErrorKind.tooLarge);
  if (cents == 0) return const AmountError(AmountErrorKind.notPositive);
  return AmountOk(cents);
}

/// Garde chiffres, espaces et séparateur ; tout séparateur saisi (`.` ou `,`)
/// devient celui de la langue ([separator]) : « 12.5 » s'affiche « 12,5 » en français.
class AmountInputFormatter extends TextInputFormatter {
  AmountInputFormatter(this.separator);

  final String separator;

  static final _rejected = RegExp('[^0-9.,$_spaces]');

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final buffer = StringBuffer();
    var cursor = newValue.selection.baseOffset;
    final text = newValue.text;
    for (var i = 0; i < text.length; i++) {
      final char = text[i];
      if (_rejected.hasMatch(char)) {
        if (i < newValue.selection.baseOffset) cursor--;
        continue;
      }
      buffer.write(char == '.' || char == ',' ? separator : char);
    }
    final result = buffer.toString();
    return TextEditingValue(
      text: result,
      selection: TextSelection.collapsed(
        offset: cursor.clamp(0, result.length),
      ),
    );
  }
}
