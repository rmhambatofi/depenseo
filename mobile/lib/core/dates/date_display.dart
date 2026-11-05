import 'package:intl/intl.dart';

import 'today.dart';

final _plainDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

/// Date `AAAA-MM-JJ` validée, en composantes UTC : indépendante du fuseau de
/// l'appareil (un minuit local inexistant ne décale rien).
DateTime? _utcComponents(String date) {
  final m = _plainDate.firstMatch(date);
  if (m == null) return null;
  final [y, mo, d] = [1, 2, 3].map((i) => int.parse(m.group(i)!)).toList();
  final utc = DateTime.utc(y, mo, d);
  return utc.year == y && utc.month == mo && utc.day == d ? utc : null;
}

/// Composantes d'une date calendaire `AAAA-MM-JJ` en [DateTime] **local** à
/// minuit, réservé aux sélecteurs de date (NF-FMT-02). Aucune conversion de
/// fuseau : relire avec [formatPlainDate]. Lève [FormatException] si la chaîne
/// n'est pas une date valide.
DateTime parsePlainDate(String date) {
  final utc = _utcComponents(date);
  if (utc == null) throw FormatException('Date AAAA-MM-JJ attendue', date);
  return DateTime(utc.year, utc.month, utc.day);
}

/// Date calendaire `AAAA-MM-JJ` affichée telle quelle selon la langue, sans
/// fuseau (NF-FMT-02) ; [long] : mois en toutes lettres. Chaîne invalide
/// (donnée corrompue) : affichée brute plutôt que de casser l'écran.
String formatCalendarDate(String date, String locale, {bool long = false}) {
  final utc = _utcComponents(date);
  if (utc == null) return date;
  return (long ? DateFormat.yMMMMd(locale) : DateFormat.yMMMd(locale)).format(
    utc,
  );
}

/// Jour calendaire d'un horodatage [instant] dans le fuseau du compte
/// [timeZone], affiché selon la langue (ADR-059).
String formatInstantDate(String timeZone, DateTime instant, String locale) =>
    formatCalendarDate(todayIn(timeZone, instant), locale);
