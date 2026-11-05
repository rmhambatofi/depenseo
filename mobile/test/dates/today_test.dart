@Tags(['tz'])
library;

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
      // 04:30 UTC le 1er nov. = 00:30 EDT le 1er ; le 2 nov. = 23:30 EST le 1er.
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 11, 1, 4, 30)),
        '2026-11-01',
      );
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 11, 2, 4, 30)),
        '2026-11-01',
      );
    });

    test('instants qui encadrent exactement les transitions', () {
      // Paris, printemps : minuit le 29 mars = 23:00 UTC le 28 (UTC+1) ;
      // la bascule (01:00 UTC le 29) ne change pas le jour.
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 3, 28, 22, 59, 59, 999)),
        '2026-03-28',
      );
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 3, 28, 23)),
        '2026-03-29',
      );
      // Paris, automne : 00:00 locale le 25 oct. = 22:00 UTC le 24 (UTC+2).
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 10, 24, 21, 59)),
        '2026-10-24',
      );
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 10, 24, 22)),
        '2026-10-25',
      );
      // Paris, automne : minuit le 26 oct. = 23:00 UTC le 25 (UTC+1).
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 10, 25, 22, 59)),
        '2026-10-25',
      );
      expect(
        todayIn('Europe/Paris', DateTime.utc(2026, 10, 25, 23)),
        '2026-10-26',
      );
      // Lisbonne : UTC+0 en hiver, UTC+1 en été.
      expect(
        todayIn('Europe/Lisbon', DateTime.utc(2026, 10, 25, 23, 59)),
        '2026-10-25',
      );
      // Montréal : 06:00 UTC le 1er nov. (02:00 EDT → 01:00 EST), même jour.
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 11, 1, 5, 59)),
        '2026-11-01',
      );
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 11, 1, 6)),
        '2026-11-01',
      );
      // Montréal, printemps : la bascule (07:00 UTC le 8 mars) garde le jour.
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 3, 8, 6, 59)),
        '2026-03-08',
      );
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 3, 8, 7)),
        '2026-03-08',
      );
      // Montréal, printemps : minuit le 8 mars = 05:00 UTC (EST).
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 3, 8, 4, 59)),
        '2026-03-07',
      );
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 3, 8, 5)),
        '2026-03-08',
      );
      // Minuit le 9 mars = 04:00 UTC (EDT).
      expect(
        todayIn('America/Montreal', DateTime.utc(2026, 3, 9, 4)),
        '2026-03-09',
      );
      // La Réunion : UTC+4 toute l'année, minuit = 20:00 UTC.
      expect(
        todayIn('Indian/Reunion', DateTime.utc(2026, 3, 28, 19, 59)),
        '2026-03-28',
      );
      expect(
        todayIn('Indian/Reunion', DateTime.utc(2026, 3, 28, 20)),
        '2026-03-29',
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
