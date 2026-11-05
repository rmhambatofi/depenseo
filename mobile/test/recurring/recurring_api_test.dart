// Client des récurrences (P6-09, ADR-054) : lecture groupée, tri des
// échéances en attente, correspondance des erreurs.
import 'package:depenseo/core/recurring/recurring_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import 'recurring_harness.dart';

void main() {
  late FakeApi fake;
  late RecurringApi api;
  const nb = '0190a000-0000-7000-8000-00000000000b';

  setUp(() {
    fake = FakeApi();
    api = RecurringApi(Dio()..httpClientAdapter = fake);
    fake
      ..on(
        'GET /notebooks/$nb/recurring-expenses',
        (_) => FakeResponse(200, [
          recurring(),
          recurring(id: phoneId, name: 'Box'),
        ]),
      )
      ..on(
        'GET /notebooks/$nb/recurring-expenses/$rentId/occurrences',
        (_) => FakeResponse(200, [
          occurrence(id: paidOccId, dueDate: '2026-10-05', status: 'paid'),
          occurrence(dueDate: '2026-11-05'),
        ]),
      )
      ..on(
        'GET /notebooks/$nb/recurring-expenses/$phoneId/occurrences',
        (_) => FakeResponse(200, [
          occurrence(
            id: phoneOccId,
            recurringId: phoneId,
            name: 'Box',
            dueDate: '2026-11-05',
          ),
          occurrence(
            id: '0190a000-0000-7000-8000-000000000303',
            recurringId: phoneId,
            name: 'Box',
            dueDate: '2026-11-01',
            status: 'skipped',
          ),
        ]),
      )
      ..on(
        'GET /me',
        (_) => const FakeResponse(200, {'reminderTime': '08:15'}),
      );
  });

  test('en attente seulement, par date puis nom ; heure des rappels', () async {
    final o = await api.overview(nb);
    expect(o.recurring.map((r) => r.name), ['Loyer', 'Box']);
    expect(o.pending.map((p) => p.id), [phoneOccId, rentOccId]);
    expect(o.reminderTime, '08:15');
  });

  test(
    'valeur inconnue ou champ absent : hors ligne, rien de faux affiché',
    () async {
      fake.on(
        'GET /notebooks/$nb/recurring-expenses',
        (_) => FakeResponse(200, [recurring(frequency: 'daily')]),
      );
      await expectLater(
        api.overview(nb),
        throwsA(
          isA<RecurringError>().having(
            (e) => e.failure,
            'failure',
            RecurringFailure.offline,
          ),
        ),
      );
      fake
        ..on(
          'GET /notebooks/$nb/recurring-expenses',
          (_) => FakeResponse(200, [recurring()]),
        )
        ..on('GET /me', (_) => const FakeResponse(200, {}));
      await expectLater(
        api.overview(nb),
        throwsA(
          isA<RecurringError>().having(
            (e) => e.failure,
            'failure',
            RecurringFailure.offline,
          ),
        ),
      );
    },
  );

  test(
    'statuts HTTP : 400/422 refus, 404/409 conflit, 5xx et réseau hors ligne',
    () async {
      Future<RecurringFailure> failureFor(FakeHandler handler) async {
        fake.on('POST /notebooks/$nb/occurrences/$rentOccId/skip', handler);
        try {
          await api.skip(nb, rentOccId);
        } on RecurringError catch (e) {
          return e.failure;
        }
        fail('aucune erreur');
      }

      expect(
        await failureFor((_) => FakeResponse.problem(400, 'x')),
        RecurringFailure.invalid,
      );
      expect(
        await failureFor((_) => FakeResponse.problem(422, 'x')),
        RecurringFailure.invalid,
      );
      expect(
        await failureFor((_) => FakeResponse.problem(404, 'x')),
        RecurringFailure.conflict,
      );
      expect(
        await failureFor((_) => FakeResponse.problem(409, 'x')),
        RecurringFailure.conflict,
      );
      expect(
        await failureFor((_) => FakeResponse.problem(503, 'x')),
        RecurringFailure.offline,
      );
      expect(
        await failureFor((_) => throw Exception('réseau')),
        RecurringFailure.offline,
      );
    },
  );
}
