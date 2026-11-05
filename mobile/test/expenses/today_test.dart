import 'package:depenseo/core/dates/today.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // NF-FMT-04/05 : « aujourd'hui » se calcule dans le fuseau du compte,
  // jamais en UTC ni dans celui de l'appareil.
  group('todayIn', () {
    test('même instant, date différente selon le fuseau', () {
      final instant = DateTime.utc(2026, 11, 5, 22, 30);
      expect(todayIn('Europe/Paris', instant), '2026-11-05');
      expect(todayIn('Europe/Lisbon', instant), '2026-11-05');
      expect(todayIn('America/Montreal', instant), '2026-11-05');
      expect(todayIn('Indian/Reunion', instant), '2026-11-06');
    });

    test('Montréal est encore la veille juste après minuit UTC', () {
      final instant = DateTime.utc(2026, 11, 6, 3);
      expect(todayIn('America/Montreal', instant), '2026-11-05');
      expect(todayIn('Europe/Paris', instant), '2026-11-06');
    });

    test('changement d\'heure d\'été en Europe (29 mars 2026)', () {
      // 22:30 UTC le 28 = 23:30 Paris (UTC+1) ; 22:30 UTC le 29 = 00:30 (UTC+2).
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 3, 28, 22, 30)),
        '2026-03-28',
      );
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 3, 29, 22, 30)),
        '2026-03-30',
      );
      expect(
        todayIn('Europe/Lisbon', DateTime.utc(2026, 3, 29, 23, 30)),
        '2026-03-30',
      );
    });

    test('changement d\'heure d\'hiver à Montréal (1er novembre 2026)', () {
      // 04:30 UTC : 00:30 EDT le 31 oct. → minuit passé ; après le recul, 23:30 EST.
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 11, 1, 4, 30)),
        '2026-11-01',
      );
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 11, 2, 4, 30)),
        '2026-11-01',
      );
    });

    test('instant local converti, jamais lu comme heure murale', () {
      final instant = DateTime.utc(2026, 11, 5, 22, 30).toLocal();
      expect(todayIn('Indian/Reunion', instant), '2026-11-06');
    });

    test('fuseau inconnu → date UTC (repli documenté, ADR-049)', () {
      expect(
        todayIn('Mars/Olympus', DateTime.utc(2026, 11, 5, 23)),
        '2026-11-05',
      );
    });
  });
}
