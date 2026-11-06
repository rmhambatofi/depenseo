import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'core/appearance/theme_preference.dart';
import 'core/observability/sentry_config.dart';
import 'core/secure/secure_store.dart';
import 'features/account/legal_screens.dart';
import 'features/account/legal_texts.dart';
import 'features/settings/theme_mode_controller.dart';

Future<void> main() async {
  // Valide l'origine de l'API dès le démarrage (https exigé en release).
  resolveApiBaseUrl(apiBaseUrl, release: kReleaseMode);
  checkLegalConfig(release: kReleaseMode);
  registerNativeLicenses();
  WidgetsFlutterBinding.ensureInitialized();
  final themeMode = await initialThemeMode();
  void run() => runApp(
    ProviderScope(
      overrides: [initialThemeModeProvider.overrideWithValue(themeMode)],
      child: const DepenseoApp(),
    ),
  );
  // Suivi des plantages (NF-QUA-02, ADR-064) seulement si un DSN UE est fourni.
  final dsn = sentryDsnFor(sentryDsn);
  if (dsn == null) return run();
  await SentryFlutter.init(
    (options) =>
        configureSentry(options, dsn: dsn, environment: sentryEnvironment),
    appRunner: run,
  );
}

/// Thème choisi, lu avant le premier rendu ; Auto si le coffre tarde ou échoue
/// (borne : le démarrage ne doit pas en dépendre, NF-PERF-01).
Future<ThemeMode> initialThemeMode() async {
  try {
    return await ThemePreference(PlatformSecureStore())
        .load()
        .timeout(const Duration(milliseconds: 300));
  } on Object {
    return ThemeMode.system;
  }
}
