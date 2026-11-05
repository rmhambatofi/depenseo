import 'package:depenseo/config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('développement : http local accepté', () {
    expect(
      resolveApiBaseUrl('http://localhost:3000', release: false),
      'http://localhost:3000',
    );
  });

  test('release : https exigé', () {
    expect(
      resolveApiBaseUrl('https://api.depenseo.fr', release: true),
      'https://api.depenseo.fr',
    );
    expect(
      () => resolveApiBaseUrl('http://localhost:3000', release: true),
      throwsStateError,
    );
  });
}
