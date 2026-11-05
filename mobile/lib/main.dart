import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'core/observability/sentry_config.dart';
import 'features/account/legal_screens.dart';
import 'features/account/legal_texts.dart';

Future<void> main() async {
  // Valide l'origine de l'API dès le démarrage (https exigé en release).
  resolveApiBaseUrl(apiBaseUrl, release: kReleaseMode);
  checkLegalConfig(release: kReleaseMode);
  registerNativeLicenses();
  void run() => runApp(const ProviderScope(child: DepenseoApp()));
  // Suivi des plantages (NF-QUA-02, ADR-064) seulement si un DSN UE est fourni.
  final dsn = sentryDsnFor(sentryDsn);
  if (dsn == null) return run();
  await SentryFlutter.init(
    (options) =>
        configureSentry(options, dsn: dsn, environment: sentryEnvironment),
    appRunner: run,
  );
}
