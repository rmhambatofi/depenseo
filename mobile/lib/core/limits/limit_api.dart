import 'package:dio/dio.dart';

import 'limit_models.dart';

/// Pourquoi une lecture ou une écriture de limite a échoué.
enum LimitFailure {
  /// Réseau absent, serveur indisponible, session changée ou expirée.
  offline,

  /// Corps refusé (400/422).
  invalid,

  /// Version créée ou passée entre-temps (409) : recharger.
  conflict,
}

class LimitError implements Exception {
  const LimitError(this.failure);

  final LimitFailure failure;
}

/// Jauge courante et historique des versions, lus ensemble à l'ouverture.
class LimitOverview {
  const LimitOverview({
    required this.today,
    required this.current,
    required this.versions,
  });

  /// Jour du compte (`AAAA-MM-JJ`) selon l'API.
  final String today;
  final PeriodSummary current;

  /// Par date d'effet croissante.
  final List<LimitVersion> versions;

  LimitVersion? get last => versions.lastOrNull;
}

/// Routes `…/limits` d'ADR-027/028, en ligne seulement (ADR-053).
class LimitApi {
  LimitApi(this._dio);

  final Dio _dio;

  Future<LimitOverview> overview(String notebookId) => _guard(() async {
    final base = '/notebooks/$notebookId/limits';
    final current = await _dio.get<Map<String, dynamic>>('$base/current');
    final history = await _dio.get<List<dynamic>>(base);
    final versions = [
      for (final v in history.data!)
        LimitVersion.fromJson(v as Map<String, dynamic>),
    ]..sort((a, b) => a.effectiveDate.compareTo(b.effectiveDate));
    return LimitOverview(
      today: current.data!['today'] as String,
      current: PeriodSummary.fromJson(
        current.data!['current'] as Map<String, dynamic>,
      ),
      versions: versions,
    );
  });

  Future<void> write(String notebookId, LimitWrite write) => _guard(
    // Version modifiée introuvable (supprimée ailleurs) : recharger.
    notFound: write is LimitPatch
        ? LimitFailure.conflict
        : LimitFailure.offline,
    () async {
      final base = '/notebooks/$notebookId/limits';
      switch (write) {
        case LimitUnchanged():
          return;
        case LimitCreate(:final body):
          await _dio.post<Map<String, dynamic>>(base, data: body);
        case LimitPatch(:final id, :final body):
          await _dio.patch<Map<String, dynamic>>('$base/$id', data: body);
      }
    },
  );

  Future<T> _guard<T>(
    Future<T> Function() request, {
    LimitFailure notFound = LimitFailure.offline,
  }) async {
    try {
      return await request();
    } on DioException catch (e) {
      throw _map(e, notFound);
    } on FormatException {
      // Réponse illisible (valeur inconnue) : ne rien afficher de faux.
      throw const LimitError(LimitFailure.offline);
    }
  }

  LimitError _map(DioException error, LimitFailure notFound) =>
      LimitError(switch (error.response?.statusCode) {
        400 || 422 => LimitFailure.invalid,
        409 => LimitFailure.conflict,
        404 => notFound,
        // Réseau, 5xx, 401, 403, 404 du carnet (changement de compte…).
        _ => LimitFailure.offline,
      });
}
