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

final _plainMonth = RegExp(r'^(\d{4})-(\d{2})$');

/// Mois calendaire `AAAA-MM` d'une date `AAAA-MM-JJ` (préfixe, sans fuseau).
String monthOf(String date) => date.substring(0, 7);

/// Mois `AAAA-MM` décalé de [delta] mois (arithmétique entière, sans fuseau).
String shiftMonth(String month, int delta) {
  final m = _plainMonth.firstMatch(month);
  if (m == null) throw FormatException('Mois AAAA-MM attendu', month);
  final index = int.parse(m.group(1)!) * 12 + int.parse(m.group(2)!) - 1;
  final shifted = index + delta;
  return '${(shifted ~/ 12).toString().padLeft(4, '0')}-'
      '${(shifted % 12 + 1).toString().padLeft(2, '0')}';
}

/// Bornes incluses d'un mois, à comparer **comme chaînes** aux dates
/// `AAAA-MM-JJ` : `-31` majore tout jour du mois sans calcul de calendrier.
(String, String) monthBounds(String month) => ('$month-01', '$month-31');

/// Mois `AAAA-MM` en toutes lettres selon la langue (« novembre 2026 ») ;
/// valeur invalide affichée brute.
String formatCalendarMonth(String month, String locale) {
  final m = _plainMonth.firstMatch(month);
  final mo = m == null ? 0 : int.parse(m.group(2)!);
  if (mo < 1 || mo > 12) return month;
  return DateFormat.yMMMM(locale)
      .format(DateTime.utc(int.parse(m!.group(1)!), mo));
}
