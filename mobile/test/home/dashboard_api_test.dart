import 'package:depenseo/core/dashboard/dashboard_api.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dashboard_fixture.dart';

void main() {
  test('lit la réponse de l\'API sans rien recalculer', () {
    final d = Dashboard.fromJson(dashboard());
    expect(d.today, '2026-11-05');
    expect(d.gauge.limit, 50000);
    expect(d.gauge.spent, 31000);
    expect(d.upcoming.single.occurrence.name, 'Loyer');
    expect(d.upcoming.single.overdue, isFalse);
    expect(d.categories.map((c) => (c.total, c.percent)), [
      (21000, 68),
      (10000, 32),
    ]);
    expect(d.current.last.cumulative, 31000);
    expect(d.previous, hasLength(31));
  });

  test('évolution remise dans l\'ordre chronologique', () {
    final d = Dashboard.fromJson(dashboard());
    expect(d.evolution, hasLength(12));
    expect(d.evolution.first.start, '2025-12-01');
    expect(d.evolution.last.start, '2026-11-01');
    expect(d.evolution.last.spent, 31000);
  });

  test('cumul précédent lu au même rang de jour', () {
    expect(Dashboard.fromJson(dashboard()).previousAtSameDay?.cumulative, 5000);
    // Période précédente plus courte : son dernier point.
    final short = Dashboard.fromJson(
      dashboard(
        current: [point(30, 9000)],
        previous: [
          point(1, 100, month: '10'),
          point(28, 700, month: '10'),
        ],
      ),
    );
    expect(short.previousAtSameDay?.cumulative, 700);
    // Aucun point dans la période en cours : pas de comparaison.
    final none = Dashboard.fromJson(dashboard(current: []));
    expect(none.previousAtSameDay, isNull);
    expect(
      Dashboard.fromJson(dashboard(previous: [])).previousAtSameDay,
      isNull,
    );
  });

  test('période précédente dans une autre devise : pas de comparaison', () {
    final json = dashboard();
    final evolution = json['evolution'] as List<Map<String, dynamic>>;
    evolution[1] = {...evolution[1], 'currency': 'CHF'};
    expect(Dashboard.fromJson(json).previousAtSameDay, isNull);
  });

  test('réponse illisible : FormatException ou TypeError', () {
    final unknown = dashboard()
      ..['gauge'] = {
        ...dashboard()['gauge'] as Map<String, dynamic>,
        'periodKind': 'day',
      };
    expect(() => Dashboard.fromJson(unknown), throwsFormatException);
    final missing = dashboard()..remove('cumulative');
    expect(() => Dashboard.fromJson(missing), throwsA(isA<TypeError>()));
  });

  test('parseDashboard : réponse illisible → DashboardUnavailable', () {
    final missing = dashboard()..remove('cumulative');
    expect(() => parseDashboard(missing), throwsA(isA<DashboardUnavailable>()));
    expect(() => parseDashboard(null), throwsA(isA<DashboardUnavailable>()));
    expect(() => parseDashboard('x'), throwsA(isA<DashboardUnavailable>()));
  });
}
