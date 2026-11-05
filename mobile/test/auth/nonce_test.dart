import 'package:depenseo/core/auth/nonce.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'sha256Hex : vecteur connu (ADR-020, empreinte transmise au fournisseur)',
    () {
      expect(
        sha256Hex('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    },
  );

  test('generateNonce : 43 caractères base64url, tirages distincts', () {
    final a = generateNonce();
    final b = generateNonce();

    expect(a, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
    expect(a, isNot(b));
  });
}
