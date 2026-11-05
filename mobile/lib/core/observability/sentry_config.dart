// Suivi des plantages (NF-QUA-02) chez Sentry, région UE (§8.1, ADR-064).
// Ne quittent l'appareil que le type d'erreur, la pile, l'appareil (sans son
// nom), le système et l'identifiant d'installation : messages, requêtes,
// données libres et fils d'Ariane peuvent porter un montant ou une donnée
// personnelle (NF-SEC-06).
import 'package:flutter/foundation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// DSN Sentry fixé à la compilation : `--dart-define=SENTRY_DSN=…` (vide = aucun
/// envoi). `SENTRY_ENVIRONMENT` : dev, recette ou prod.
const sentryDsn = String.fromEnvironment('SENTRY_DSN');
const sentryEnvironment = String.fromEnvironment(
  'SENTRY_ENVIRONMENT',
  defaultValue: kReleaseMode ? 'production' : 'development',
);

/// Clés dont la valeur est retirée (même liste que les journaux de l'API).
final _sensitiveKey = RegExp(
  r'^(amount.*|.*e?mail.*|.*password.*|.*token.*|.*secret.*|notes?|merchant|'
  r'authorization|cookie|set-cookie|phone.*|iban|(display|first|last|full)_?name)$',
  caseSensitive: false,
);

/// Contextes standard du SDK conservés ; tout autre contexte est retiré.
const _keptContexts = {
  'device',
  'os',
  'app',
  'runtime',
  'runtimes',
  'culture',
  'gpu',
  'trace',
  'flutter_context',
};

/// Tags posés par le SDK conservés ; tout autre tag est retiré.
const _keptTags = {'event.origin', 'event.environment'};

/// `null` si [dsn] est vide ; erreur au démarrage s'il n'est pas de la région
/// UE (`https://clé@o<org>.ingest.de.sentry.io/<projet>`).
String? sentryDsnFor(String dsn) {
  if (dsn.isEmpty) return null;
  final uri = Uri.tryParse(dsn);
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.userInfo.isEmpty ||
      !uri.host.endsWith('.de.sentry.io')) {
    throw StateError('SENTRY_DSN doit désigner la région UE de Sentry');
  }
  return dsn;
}

String _withoutQuery(String url) {
  final end = url.indexOf(RegExp('[?#]'));
  return end == -1 ? url : url.substring(0, end);
}

Object? _redact(Object? value) => switch (value) {
  final Map<Object?, Object?> map => {
    for (final MapEntry(:key, :value) in map.entries)
      key: _sensitiveKey.hasMatch('$key') ? '[REDACTED]' : _redact(value),
  },
  final List<Object?> list => [for (final item in list) _redact(item)],
  _ => value,
};

Map<String, dynamic>? _scrubData(Map<String, dynamic>? data) {
  if (data == null) return null;
  final scrubbed = Map<String, dynamic>.from(
    _redact(data)! as Map<Object?, Object?>,
  );
  final url = scrubbed['url'];
  if (url is String) scrubbed['url'] = _withoutQuery(url);
  return scrubbed;
}

/// Fil d'Ariane sans message libre ; données expurgées, URL sans paramètres.
Breadcrumb? scrubSentryBreadcrumb(Breadcrumb? breadcrumb) {
  if (breadcrumb == null) return null;
  return breadcrumb
    ..message = null
    ..data = _scrubData(breadcrumb.data);
}

/// `beforeSend` : l'événement débarrassé de tout montant ou donnée personnelle.
SentryEvent scrubSentryEvent(SentryEvent event) {
  final userId = event.user?.id;
  final contexts = event.contexts;
  final flutterDetails = contexts['flutter_error_details'];
  contexts.removeWhere((key, _) => !_keptContexts.contains(key));
  // Seule la bibliothèque d'origine : `context`/`information` décrivent les
  // widgets, donc les textes affichés (montants, commerçants).
  if (flutterDetails is Map && flutterDetails['library'] != null) {
    contexts['flutter_error_details'] = {'library': flutterDetails['library']};
  }
  contexts.device?.name = null;
  for (final exception in event.exceptions ?? const <SentryException>[]) {
    exception.value = null;
  }
  return event
    ..message = null
    ..request = null
    // ignore: deprecated_member_use
    ..extra = null
    ..user = userId == null ? null : SentryUser(id: userId)
    ..tags = event.tags == null
        ? null
        : {
            for (final MapEntry(:key, :value) in event.tags!.entries)
              if (_keptTags.contains(key)) key: value,
          }
    ..breadcrumbs = event.breadcrumbs
        ?.map((crumb) => scrubSentryBreadcrumb(crumb)!)
        .toList();
}

/// Options de `SentryFlutter.init` : collecte minimale et nettoyage systématique.
/// Les erreurs natives (plugins Java/Kotlin, iOS, NDK) passent par le SDK
/// natif, pas par `beforeSend` : nettoyage côté serveur Sentry obligatoire
/// (ADR-064, check-list de mise en service).
void configureSentry(
  SentryFlutterOptions options, {
  required String dsn,
  required String environment,
}) {
  options
    ..dsn = dsn
    ..environment = environment
    ..sendDefaultPii = false
    ..attachScreenshot = false
    ..attachViewHierarchy = false
    ..enablePrintBreadcrumbs = false
    ..enableUserInteractionBreadcrumbs = false
    ..enableAutoNativeBreadcrumbs = false
    ..enableAutoSessionTracking = true
    ..beforeSend = ((event, hint) => scrubSentryEvent(event))
    ..beforeBreadcrumb = ((breadcrumb, hint) =>
        scrubSentryBreadcrumb(breadcrumb));
}
