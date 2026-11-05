// Choix de l'écriture d'une limite (F-LIM-09, ADR-053) et lecture des DTO.
import 'package:depenseo/core/limits/limit_models.dart';
import 'package:flutter_test/flutter_test.dart';

const newId = '0190a000-0000-7000-8000-0000000001aa';

LimitVersion version({
  String id = '0190a000-0000-7000-8000-000000000100',
  int? amount = 50000,
  String kind = 'month',
  int startDay = 1,
  bool includeRecurring = true,
  String effectiveDate = '2026-10-12',
  String? appliesFrom,
}) => LimitVersion.fromJson({
  'id': id,
  'amount': amount,
  'currency': 'EUR',
  'periodKind': kind,
  'startDay': startDay,
  'includeRecurring': includeRecurring,
  'effectiveDate': effectiveDate,
  'appliesFrom': appliesFrom ?? effectiveDate,
  'createdAt': '2026-10-12T08:00:00.000Z',
  'updatedAt': '2026-10-12T08:00:00.000Z',
});

LimitSettings settings({
  int? amount = 50000,
  LimitPeriodKind kind = LimitPeriodKind.month,
  int startDay = 1,
  bool includeRecurring = true,
}) => LimitSettings(
  amount: amount,
  periodKind: kind,
  startDay: startDay,
  includeRecurring: includeRecurring,
);

LimitWrite plan(LimitVersion? last, LimitSettings wanted) => planLimitWrite(
  last: last,
  today: '2026-11-05',
  wanted: wanted,
  newId: newId,
);

void main() {
  group('planLimitWrite', () {
    test('sans version : création avec l’identifiant du formulaire', () {
      final write = plan(null, settings(startDay: 28, includeRecurring: false));
      expect(write, isA<LimitCreate>());
      expect((write as LimitCreate).body, {
        'id': newId,
        'amount': 50000,
        'periodKind': 'month',
        'startDay': 28,
        'includeRecurring': false,
      });
    });

    test('sans version, « aucune » demandée : rien à écrire', () {
      expect(plan(null, settings(amount: null)), isA<LimitUnchanged>());
    });

    test('réglages identiques à la dernière version : rien à écrire', () {
      expect(plan(version(), settings()), isA<LimitUnchanged>());
    });

    test('version passée : nouvelle version, l’historique est gardé', () {
      final write = plan(
        version(),
        settings(kind: LimitPeriodKind.week, startDay: 3),
      );
      expect((write as LimitCreate).body, {
        'id': newId,
        'amount': 50000,
        'periodKind': 'week',
        'startDay': 3,
        'includeRecurring': true,
      });
    });

    test('limite retirée : nouvelle version sans montant', () {
      final write = plan(version(), settings(amount: null));
      expect((write as LimitCreate).body['amount'], isNull);
      expect(write.body.containsKey('amount'), isTrue);
    });

    test('version du jour : PATCH des seuls champs modifiés', () {
      final today = version(effectiveDate: '2026-11-05');
      final write = plan(today, settings(amount: 42000));
      expect(write, isA<LimitPatch>());
      expect((write as LimitPatch).id, today.id);
      expect(write.body, {'amount': 42000});
    });

    test('version du jour, type changé : type et jour envoyés ensemble', () {
      final today = version(effectiveDate: '2026-11-05', startDay: 15);
      final write = plan(
        today,
        settings(kind: LimitPeriodKind.week, startDay: 1),
      ) as LimitPatch;
      expect(write.body, {'periodKind': 'week', 'startDay': 1});
    });

    test('type de période inconnu : refusé', () {
      expect(() => LimitPeriodKind.parse('year'), throwsFormatException);
    });

    test('version du jour retirée : PATCH amount null explicite', () {
      final today = version(effectiveDate: '2026-11-05');
      final write = plan(today, settings(amount: null)) as LimitPatch;
      expect(write.body, {'amount': null});
    });
  });

  test('PeriodSummary : limite absente lue comme null', () {
    final s = PeriodSummary.fromJson({
      'start': '2026-11-01',
      'end': '2026-11-30',
      'periodKind': 'month',
      'startDay': 1,
      'limitId': null,
      'limit': null,
      'currency': 'EUR',
      'includeRecurring': true,
      'spent': 1234,
      'remaining': null,
      'consumedPercent': null,
      'elapsedDays': 5,
      'totalDays': 30,
      'elapsedPercent': 17,
      'otherCurrencies': <String>[],
    });
    expect(s.limit, isNull);
    expect(s.remaining, isNull);
    expect(s.spent, 1234);
    expect(s.periodKind, LimitPeriodKind.month);
  });
}
