import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'config.dart';

void main() {
  // Valide l'origine de l'API dès le démarrage (https exigé en release).
  resolveApiBaseUrl(apiBaseUrl, release: kReleaseMode);
  runApp(const ProviderScope(child: DepenseoApp()));
}
