import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

/// Nonce brut de connexion Apple/Google : 32 octets aléatoires en base64url sans remplissage.
/// L'API le reçoit brut ; le fournisseur reçoit son empreinte [sha256Hex] (ADR-020).
String generateNonce([Random? random]) {
  final rng = random ?? Random.secure();
  final bytes = List<int>.generate(32, (_) => rng.nextInt(256));
  return base64Url.encode(bytes).replaceAll('=', '');
}

String sha256Hex(String value) => sha256.convert(utf8.encode(value)).toString();
