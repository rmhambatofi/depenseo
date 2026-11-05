import 'package:flutter/foundation.dart';

/// Origine de l'API, fixée à la compilation : `--dart-define=API_BASE_URL=https://…`.
const _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);

final apiBaseUrl = resolveApiBaseUrl(_apiBaseUrl, release: kReleaseMode);

/// En release, seule une origine `https` est acceptée (jamais de jetons en clair).
String resolveApiBaseUrl(String value, {required bool release}) {
  final uri = Uri.tryParse(value);
  if (release && (uri?.scheme != 'https' || uri!.host.isEmpty)) {
    throw StateError(
      'API_BASE_URL doit être en https dans une build de release',
    );
  }
  return value;
}
