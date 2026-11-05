import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

var _loaded = false;

/// Date calendaire `AAAA-MM-JJ` de [instant] dans le fuseau IANA [timeZone]
/// (celui du compte, NF-FMT-04). Fuseau inconnu de la base embarquée : repli
/// sur UTC (ADR-049) plutôt que sur le fuseau de l'appareil.
String todayIn(String timeZone, DateTime instant) {
  if (!_loaded) {
    tzdata.initializeTimeZones();
    _loaded = true;
  }
  final DateTime local;
  try {
    local = tz.TZDateTime.from(instant, tz.getLocation(timeZone));
  } on tz.LocationNotFoundException {
    return formatPlainDate(instant.toUtc());
  }
  return formatPlainDate(local);
}

/// Composantes calendaires de [d] telles quelles, sans conversion de fuseau.
String formatPlainDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';
