@Tags(['tz'])
library;

import 'package:depenseo/core/dates/date_display.dart';
import 'package:depenseo/core/dates/today.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// NF-FMT-02/03/05 : dates calendaires affichées telles quelles, horodatages
/// UTC affichés dans le fuseau du compte. Ces tests ne dépendent pas du fuseau
/// de l'hôte : `tool/test_tz.sh` les rejoue sous TZ=Europe/Paris,
/// Europe/Lisbon, America/Montreal et Indian/Reunion.
void main() {
  setUpAll(() => initializeDateFormatting());

  group('parsePlainDate / formatPlainDate', () {
    test('aller-retour sans décalage, y compris les jours de changement '
        'd\'heure', () {
      for (final d in [
        '2026-03-29', // Paris/Lisbonne passent à l'heure d'été
        '2026-03-08', // Montréal passe à l'heure d'été
        '2026-10-25', // Europe : retour à l'heure d'hiver
        '2026-11-01', // Montréal : retour à l'heure d'hiver
        '2026-01-01',
        '2028-02-29',
        '2026-12-31',
      ]) {
        final parsed = parsePlainDate(d);
        expect(formatPlainDate(parsed), d, reason: d);
        expect(parsed.hour, 0, reason: d);
        expect(parsed.isUtc, isFalse, reason: 'sélecteurs en heure locale');
      }
    });

    test('rejette une chaîne qui n\'est pas AAAA-MM-JJ', () {
      for (final bad in [
        '2026-11-3',
        '2026-13-01',
        '2026-02-30',
        '2026-11-05T00:00:00Z',
        '',
      ]) {
        expect(() => parsePlainDate(bad), throwsFormatException, reason: bad);
      }
    });
  });

  group('formatCalendarDate', () {
    test('chaîne invalide affichée brute, sans exception', () {
      expect(formatCalendarDate('2026-11-3', 'fr'), '2026-11-3');
      expect(formatCalendarDate('2026-02-30', 'fr'), '2026-02-30');
    });

    test(
      'affiche le jour de la chaîne, jamais celui d\'une conversion UTC',
      () {
        expect(formatCalendarDate('2026-11-03', 'fr'), '3 nov. 2026');
        expect(formatCalendarDate('2026-11-03', 'en'), 'Nov 3, 2026');
        expect(formatCalendarDate('2026-01-01', 'fr'), '1 janv. 2026');
        expect(formatCalendarDate('2026-12-31', 'fr'), '31 déc. 2026');
      },
    );

    test('jours de changement d\'heure', () {
      expect(formatCalendarDate('2026-03-29', 'fr'), '29 mars 2026');
      expect(formatCalendarDate('2026-03-08', 'fr'), '8 mars 2026');
      expect(formatCalendarDate('2026-10-25', 'fr'), '25 oct. 2026');
      expect(formatCalendarDate('2026-11-01', 'fr'), '1 nov. 2026');
    });

    test('format long (saisie)', () {
      expect(
        formatCalendarDate('2026-03-29', 'fr', long: true),
        '29 mars 2026',
      );
      expect(
        formatCalendarDate('2026-11-01', 'en', long: true),
        'November 1, 2026',
      );
    });
  });

  group('formatInstantDate (horodatage UTC → jour du compte)', () {
    final instant = DateTime.utc(2026, 11, 5, 22, 30);

    test('même instant, jour différent selon le fuseau du compte', () {
      expect(formatInstantDate('Europe/Paris', instant, 'fr'), '5 nov. 2026');
      expect(formatInstantDate('Europe/Lisbon', instant, 'fr'), '5 nov. 2026');
      expect(
        formatInstantDate('America/Montreal', instant, 'fr'),
        '5 nov. 2026',
      );
      expect(formatInstantDate('Indian/Reunion', instant, 'fr'), '6 nov. 2026');
    });

    test('Montréal juste après minuit UTC : encore la veille', () {
      final i = DateTime.utc(2026, 11, 6, 3);
      expect(formatInstantDate('America/Montreal', i, 'fr'), '5 nov. 2026');
      expect(formatInstantDate('Indian/Reunion', i, 'fr'), '6 nov. 2026');
    });

    test('passage à l\'heure d\'été en Europe (29 mars 2026)', () {
      // 22:30 UTC le 29 = 00:30 le 30 à Paris (UTC+2), 23:30 le 29 à Lisbonne.
      final i = DateTime.utc(2026, 3, 29, 22, 30);
      expect(formatInstantDate('Europe/Paris', i, 'fr'), '30 mars 2026');
      expect(formatInstantDate('Europe/Lisbon', i, 'fr'), '29 mars 2026');
      // La veille (UTC+1 à Paris) : 23:30, même jour.
      expect(
        formatInstantDate(
          'Europe/Paris',
          DateTime.utc(2026, 3, 28, 22, 30),
          'fr',
        ),
        '28 mars 2026',
      );
    });

    test('retour à l\'heure d\'hiver en Europe (25 octobre 2026)', () {
      // 22:30 UTC le 24 = 00:30 le 25 (UTC+2) ; 22:30 UTC le 25 = 23:30 (UTC+1).
      expect(
        formatInstantDate(
          'Europe/Paris',
          DateTime.utc(2026, 10, 24, 22, 30),
          'fr',
        ),
        '25 oct. 2026',
      );
      expect(
        formatInstantDate(
          'Europe/Paris',
          DateTime.utc(2026, 10, 25, 22, 30),
          'fr',
        ),
        '25 oct. 2026',
      );
    });

    test('changements d\'heure à Montréal (8 mars et 1er novembre 2026)', () {
      // 04:30 UTC le 8 mars = 23:30 EST le 7 ; le 9 mars = 00:30 EDT le 9.
      expect(
        formatInstantDate(
          'America/Montreal',
          DateTime.utc(2026, 3, 8, 4, 30),
          'fr',
        ),
        '7 mars 2026',
      );
      expect(
        formatInstantDate(
          'America/Montreal',
          DateTime.utc(2026, 3, 9, 4, 30),
          'fr',
        ),
        '9 mars 2026',
      );
      // 04:30 UTC le 1er nov. = 00:30 EDT ; le 2 nov. = 23:30 EST le 1er.
      expect(
        formatInstantDate(
          'America/Montreal',
          DateTime.utc(2026, 11, 1, 4, 30),
          'fr',
        ),
        '1 nov. 2026',
      );
      expect(
        formatInstantDate(
          'America/Montreal',
          DateTime.utc(2026, 11, 2, 4, 30),
          'fr',
        ),
        '1 nov. 2026',
      );
    });

    test('La Réunion (UTC+4, sans heure d\'été) : 20:00 UTC = lendemain', () {
      expect(
        formatInstantDate(
          'Indian/Reunion',
          DateTime.utc(2026, 3, 29, 19, 59),
          'fr',
        ),
        '29 mars 2026',
      );
      expect(
        formatInstantDate(
          'Indian/Reunion',
          DateTime.utc(2026, 3, 29, 20),
          'fr',
        ),
        '30 mars 2026',
      );
    });

    test('un instant non UTC est converti, pas lu comme heure murale', () {
      final local = instant.toLocal();
      expect(formatInstantDate('Indian/Reunion', local, 'fr'), '6 nov. 2026');
      expect(formatInstantDate('America/Montreal', local, 'fr'), '5 nov. 2026');
    });

    test('horodatage ISO de l\'API (suffixe Z) analysé en UTC', () {
      final parsed = DateTime.parse('2026-11-05T22:30:00.000Z');
      expect(formatInstantDate('Indian/Reunion', parsed, 'fr'), '6 nov. 2026');
      expect(formatInstantDate('Europe/Paris', parsed, 'fr'), '5 nov. 2026');
    });
  });

  group('todayIn sous le fuseau de l\'hôte', () {
    test('ne dépend que de l\'instant et du fuseau du compte', () {
      final i = DateTime.utc(2026, 10, 25, 0, 30);
      expect(todayIn('Europe/Paris', i), '2026-10-25');
      expect(todayIn('Europe/Lisbon', i), '2026-10-25');
      expect(todayIn('America/Montreal', i), '2026-10-24');
      expect(todayIn('Indian/Reunion', i), '2026-10-25');
    });
  });

  group('mois calendaires (liste des dépenses, P8-05)', () {
    test('monthOf, shiftMonth : arithmétique entière, années comprises', () {
      expect(monthOf('2026-11-05'), '2026-11');
      expect(shiftMonth('2026-11', -1), '2026-10');
      expect(shiftMonth('2026-01', -1), '2025-12');
      expect(shiftMonth('2026-12', 1), '2027-01');
      expect(shiftMonth('2026-03', -15), '2024-12');
      expect(shiftMonth('2026-03', 0), '2026-03');
    });

    test('monthBounds : bornes AAAA-MM-JJ comparables comme chaînes', () {
      expect(monthBounds('2026-02'), ('2026-02-01', '2026-02-31'));
      // Toute date valide du mois est entre les bornes, aucune d'un autre.
      for (final d in ['2026-02-01', '2026-02-28', '2028-02-29']) {
        final (from, to) = monthBounds(monthOf(d));
        expect(d.compareTo(from) >= 0 && d.compareTo(to) <= 0, isTrue);
      }
      final (from, to) = monthBounds('2026-02');
      expect('2026-03-01'.compareTo(to) > 0, isTrue);
      expect('2026-01-31'.compareTo(from) < 0, isTrue);
    });

    test('formatCalendarMonth : mois en toutes lettres selon la langue', () {
      expect(formatCalendarMonth('2026-11', 'fr'), 'novembre 2026');
      expect(formatCalendarMonth('2026-03', 'en'), 'March 2026');
      expect(formatCalendarMonth('2026-13', 'fr'), '2026-13');
    });

    test('mois courant dans le fuseau du compte, pas de l\'hôte', () {
      // 31 octobre 23:30 UTC : déjà novembre à Paris et à La Réunion.
      final i = DateTime.utc(2026, 10, 31, 23, 30);
      expect(monthOf(todayIn('Europe/Paris', i)), '2026-11');
      expect(monthOf(todayIn('Indian/Reunion', i)), '2026-11');
      expect(monthOf(todayIn('America/Montreal', i)), '2026-10');
      expect(monthOf(todayIn('Europe/Lisbon', i)), '2026-10');
    });
  });
}
