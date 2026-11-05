import 'package:dio/dio.dart';

import '../limits/limit_models.dart';
import '../recurring/recurring_api.dart';

// Tableau de bord (F-TB-01/02, ADR-031, ADR-055) : tout est calculé par
// l'API (invariant 8) ; l'appareil affiche `GET …/dashboard` tel quel.

/// Lecture du tableau de bord impossible (réseau, serveur, session changée,
/// réponse illisible) : l'accueil le signale sans rien afficher de faux.
class DashboardUnavailable implements Exception {
  const DashboardUnavailable();
}

/// Prochaine échéance (`UpcomingOccurrenceDto`).
class UpcomingOccurrence {
  const UpcomingOccurrence(this.occurrence, {required this.overdue});

  factory UpcomingOccurrence.fromJson(Map<String, dynamic> j) =>
      UpcomingOccurrence(Occurrence.fromJson(j), overdue: j['overdue'] as bool);

  final Occurrence occurrence;

  /// Échéance passée encore en attente.
  final bool overdue;
}

/// Part d'une catégorie racine dans la période en cours.
class CategoryShare {
  const CategoryShare({
    required this.categoryId,
    required this.total,
    required this.percent,
  });

  factory CategoryShare.fromJson(Map<String, dynamic> j) => CategoryShare(
    categoryId: j['categoryId'] as String,
    total: j['total'] as int,
    percent: j['percent'] as int,
  );

  final String categoryId;

  /// Unités mineures, dans la devise de la jauge.
  final int total;

  /// 0…100, arrondi par l'API.
  final int percent;
}

/// Cumul au jour de rang [day] (1 = premier jour de la période).
class CumulativePoint {
  const CumulativePoint({
    required this.day,
    required this.date,
    required this.cumulative,
  });

  factory CumulativePoint.fromJson(Map<String, dynamic> j) => CumulativePoint(
    day: j['day'] as int,
    date: j['date'] as String,
    cumulative: j['cumulative'] as int,
  );

  final int day;
  final String date;
  final int cumulative;
}

class Dashboard {
  const Dashboard({
    required this.today,
    required this.gauge,
    required this.upcoming,
    required this.categories,
    required this.current,
    required this.previous,
    required this.evolution,
  });

  /// Lève [FormatException] (ou une erreur de type) sur une réponse
  /// illisible.
  factory Dashboard.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(Object? raw, T Function(Map<String, dynamic>) parse) => [
      for (final item in raw! as List<dynamic>)
        parse(item as Map<String, dynamic>),
    ];
    final cumulative = j['cumulative'] as Map<String, dynamic>;
    final evolution = list(j['evolution'], PeriodSummary.fromJson);
    if (evolution.isEmpty) throw const FormatException('evolution');
    return Dashboard(
      today: j['today'] as String,
      gauge: PeriodSummary.fromJson(j['gauge'] as Map<String, dynamic>),
      upcoming: list(j['upcoming'], UpcomingOccurrence.fromJson),
      categories: list(j['categories'], CategoryShare.fromJson),
      current: list(cumulative['current'], CumulativePoint.fromJson),
      previous: list(cumulative['previous'], CumulativePoint.fromJson),
      // L'API renvoie la période en cours d'abord : ordre chronologique ici.
      evolution: evolution.reversed.toList(),
    );
  }

  /// Jour du compte (`AAAA-MM-JJ`) selon l'API.
  final String today;
  final PeriodSummary gauge;
  final List<UpcomingOccurrence> upcoming;

  /// Par total décroissant.
  final List<CategoryShare> categories;

  /// Cumuls de la période en cours (jusqu'à aujourd'hui) et de la précédente.
  final List<CumulativePoint> current;
  final List<CumulativePoint> previous;

  /// 12 périodes, de la plus ancienne à la période en cours.
  final List<PeriodSummary> evolution;

  /// Cumul de la période précédente au même rang de jour que le dernier
  /// point de la période en cours (son dernier point si elle était plus
  /// courte) ; `null` sans point de part ou d'autre, ou si la période
  /// précédente est comptée dans une autre devise (ADR-031 : devise de sa
  /// version de limite). Simple lecture des valeurs de l'API.
  CumulativePoint? get previousAtSameDay {
    final day = current.lastOrNull?.day;
    if (day == null || previous.isEmpty) return null;
    if (evolution.length < 2 ||
        evolution[evolution.length - 2].currency != gauge.currency) {
      return null;
    }
    return previous.lastWhere(
      (p) => p.day <= day,
      orElse: () => previous.first,
    );
  }
}

/// `GET /notebooks/{id}/dashboard`, en ligne seulement.
class DashboardApi {
  DashboardApi(this._dio);

  final Dio _dio;

  /// Réponse brute (pour la copie locale) et sa lecture.
  Future<(Dashboard, Map<String, dynamic>)> read(String notebookId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notebooks/$notebookId/dashboard',
      );
      return (parseDashboard(response.data!), response.data!);
    } on DioException {
      throw const DashboardUnavailable();
    }
  }
}

/// Lève [DashboardUnavailable] sur une réponse illisible (valeur inconnue,
/// champ absent ou de mauvais type : API plus récente).
Dashboard parseDashboard(Object? json) {
  try {
    return Dashboard.fromJson(json! as Map<String, dynamic>);
  } on Object catch (e) {
    if (e is FormatException || e is TypeError) {
      throw const DashboardUnavailable();
    }
    rethrow;
  }
}
