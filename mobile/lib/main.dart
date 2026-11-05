import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'config.dart';
import 'features/account/legal_screens.dart';
import 'features/account/legal_texts.dart';

void main() {
  // Valide l'origine de l'API dès le démarrage (https exigé en release).
  resolveApiBaseUrl(apiBaseUrl, release: kReleaseMode);
  checkLegalConfig(release: kReleaseMode);
  registerNativeLicenses();
  runApp(const ProviderScope(child: DepenseoApp()));
}
