// Suivi des plantages Sentry (NF-QUA-02, NF-SEC-06, ADR-064) : un événement
// ne quitte l'appareil qu'après retrait des montants et données personnelles.
import 'dart:convert';

import 'package:depenseo/core/observability/sentry_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

const _euDsn =
    'https://0123456789abcdef0123456789abcdef@o123456.ingest.de.sentry.io/4500000000000001';
const _secrets = [
  '98765',
  '987,65',
  'alice@example.fr',
  'Boulangerie Martin',
  'iPhone de Alice',
  '203.0.113.7',
];

void _expectClean(SentryEvent? event) {
  final text = jsonEncode(event!.toJson());
  for (final secret in _secrets) {
    expect(text, isNot(contains(secret)), reason: secret);
  }
}

SentryEvent _dirtyEvent() => SentryEvent(
  message: SentryMessage('Dépense de 987,65 € pour alice@example.fr'),
  exceptions: [
    SentryException(
      type: 'FormatException',
      value: 'Invalid amount 98765 (Boulangerie Martin)',
      stackTrace: SentryStackTrace(
        frames: [
          SentryStackFrame(
            fileName: 'quick_entry_screen.dart',
            function: 'save',
            lineNo: 42,
          ),
        ],
      ),
    ),
  ],
  user: SentryUser(
    id: 'installation-1',
    email: 'alice@example.fr',
    ipAddress: '203.0.113.7',
    name: 'Alice',
  ),
  request: SentryRequest(
    url: 'https://api.depenseo.fr/api/v1/x?email=alice@example.fr',
    data: {'amountCents': 98765},
  ),
  // ignore: deprecated_member_use
  extra: {'amountCents': 98765, 'merchant': 'Boulangerie Martin'},
  tags: {
    'event.origin': 'flutter',
    'screen': 'quick-entry',
    'email': 'alice@example.fr',
  },
  contexts:
      Contexts(
          device: SentryDevice(name: 'iPhone de Alice', model: 'iPhone16,1'),
          operatingSystem: SentryOperatingSystem(name: 'iOS', version: '26.1'),
        )
        ..['flutter_error_details'] = {
          'information': 'Text("987,65 €") overflowed',
          'context': 'thrown building Text("Boulangerie Martin")',
          'library': 'rendering library',
        },
  breadcrumbs: [
    Breadcrumb(
      message: 'saved 98765 for alice@example.fr',
      category: 'console',
      data: {'amount': 98765},
    ),
    Breadcrumb(
      category: 'http',
      data: {
        'url': 'https://api.depenseo.fr/api/v1/x?email=alice@example.fr',
        'status_code': 500,
      },
    ),
  ],
);

void main() {
  group('scrubSentryEvent', () {
    test('nettoie un événement contenant un montant et des données '
        'personnelles', () {
      _expectClean(scrubSentryEvent(_dirtyEvent()));
    });

    test('garde le diagnostic : type, pile, appareil, système, statut', () {
      final event = scrubSentryEvent(_dirtyEvent());
      final exception = event.exceptions!.single;
      expect(exception.type, 'FormatException');
      expect(exception.value, isNull);
      expect(exception.stackTrace!.frames.single.function, 'save');
      expect(event.user?.id, 'installation-1');
      expect(event.user?.email, isNull);
      expect(event.request, isNull);
      expect(event.contexts.device?.model, 'iPhone16,1');
      expect(event.contexts.operatingSystem?.version, '26.1');
      expect(event.contexts['flutter_error_details'], {
        'library': 'rendering library',
      });
      expect(event.tags, {'event.origin': 'flutter'});
      expect(event.breadcrumbs![1].data, {
        'url': 'https://api.depenseo.fr/api/v1/x',
        'status_code': 500,
      });
    });

    test('un fil d’Ariane perd son message et ses montants', () {
      final crumb = scrubSentryBreadcrumb(
        Breadcrumb(message: 'amount 98765', data: {'amountCents': 98765}),
      )!;
      expect(crumb.message, isNull);
      expect(jsonEncode(crumb.toJson()), isNot(contains('98765')));
    });
  });

  group('configureSentry', () {
    test('collecte minimale, nettoyage branché, sessions suivies', () async {
      final options = SentryFlutterOptions();
      configureSentry(options, dsn: _euDsn, environment: 'prod');

      expect(options.dsn, _euDsn);
      expect(options.environment, 'prod');
      expect(options.sendDefaultPii, isFalse);
      expect(options.attachScreenshot, isFalse);
      expect(options.attachViewHierarchy, isFalse);
      expect(options.enablePrintBreadcrumbs, isFalse);
      expect(options.enableUserInteractionBreadcrumbs, isFalse);
      expect(options.enableAutoNativeBreadcrumbs, isFalse);
      expect(options.tracesSampleRate, isNull);
      // Taux de sessions sans plantage (NF-QUA-02).
      expect(options.enableAutoSessionTracking, isTrue);

      final sent = await options.beforeSend!(_dirtyEvent(), Hint());
      _expectClean(sent);
      _expectClean(
        SentryEvent(
          breadcrumbs: [
            options.beforeBreadcrumb!(
              Breadcrumb(message: 'amount 98765', category: 'console'),
              Hint(),
            )!,
          ],
        ),
      );
    });
  });

  group('sentryDsnFor', () {
    test('absent : Sentry désactivé', () {
      expect(sentryDsnFor(''), isNull);
    });

    test('accepte la région UE, refuse les autres', () {
      expect(sentryDsnFor(_euDsn), _euDsn);
      for (final dsn in [
        'https://key@o1.ingest.sentry.io/1',
        'https://key@o1.ingest.us.sentry.io/1',
        'http://key@o1.ingest.de.sentry.io/1',
        'https://key@evil.example/de.sentry.io/1',
      ]) {
        expect(() => sentryDsnFor(dsn), throwsStateError, reason: dsn);
      }
    });
  });
}
