import 'dart:io';

import 'package:depenseo/core/money/amount_input.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('table des décimales identique à packages/shared (ISO 4217 figée)', () {
    final source = File('../packages/shared/src/currency.ts')
        .readAsStringSync();
    final block = RegExp(r'MINOR_UNITS[^{]*\{([^}]*)\}')
        .firstMatch(source)!
        .group(1)!;
    final shared = {
      for (final m in RegExp(r'([A-Z]{3}):\s*(\d)').allMatches(block))
        m.group(1)!: int.parse(m.group(2)!),
    };
    expect(shared, hasLength(greaterThan(10)));
    expect(minorUnits, shared);
  });
}
