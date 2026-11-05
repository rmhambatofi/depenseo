import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Requête refusée ou réseau absent (écran Compte, en ligne seulement, ADR-057).
class AccountApiException implements Exception {
  const AccountApiException({required this.status});

  /// `null` : pas de réponse (hors ligne).
  final int? status;
}

/// État d'une demande d'export (`ExportDto` / `AccountExportDto`, ADR-036/038).
enum ExportState { pending, ready, expired, failed }

ExportState _state(Map<String, dynamic> json) =>
    ExportState.values.byName(json['status'] as String);

/// Format de l'export des dépenses ; `xlsx` réservé au Premium (ADR-040).
enum ExportFormat { csv, xlsx }

/// Une demande d'export côté serveur : création, état, fichier.
abstract interface class ExportJob {
  Future<ExportState> start();
  Future<ExportState> status();
  Future<Uint8List> download();
}

/// Routes du compte : `DELETE /me` (ADR-037), export RGPD `/me/export`
/// (ADR-038), export des dépenses `/notebooks/{id}/exports` (ADR-036).
class AccountApi {
  AccountApi(this._dio);

  final Dio _dio;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw AccountApiException(status: e.response?.statusCode);
    }
  }

  /// Suppression immédiate et définitive du compte et de ses données (204).
  Future<void> deleteAccount() => _guard(() async {
    await _dio.delete<void>('/me');
  });

  /// Export complet des données personnelles (zip JSON + CSV), id UUID v7.
  ExportJob personalExport(String id) => _Job(
    this,
    create: () =>
        _dio.post<Map<String, dynamic>>('/me/export', data: {'id': id}),
    path: '/me/export/$id',
  );

  /// Export des dépenses du carnet du [from] au [to] inclus (`AAAA-MM-JJ`).
  ExportJob expenseExport({
    required String notebookId,
    required String id,
    required ExportFormat format,
    required String from,
    required String to,
  }) => _Job(
    this,
    create: () => _dio.post<Map<String, dynamic>>(
      '/notebooks/$notebookId/exports',
      data: {'id': id, 'format': format.name, 'from': from, 'to': to},
    ),
    path: '/notebooks/$notebookId/exports/$id',
  );
}

class _Job implements ExportJob {
  _Job(this._api, {required this.create, required this.path});

  final AccountApi _api;
  final Future<Response<Map<String, dynamic>>> Function() create;
  final String path;

  @override
  Future<ExportState> start() =>
      _api._guard(() async => _state((await create()).data!));

  @override
  Future<ExportState> status() => _api._guard(
    () async => _state((await _api._dio.get<Map<String, dynamic>>(path)).data!),
  );

  @override
  Future<Uint8List> download() => _api._guard(() async {
    final response = await _api._dio.get<List<int>>(
      '$path/file',
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(response.data!);
  });
}

/// L'export a échoué côté serveur, a expiré avant le téléchargement, ou n'est
/// pas prêt au bout des [exportPollDelays].
class ExportUnavailable implements Exception {
  const ExportUnavailable(this.state);

  final ExportState state;
}

/// Intervalles d'interrogation : la génération passe par la file de tâches,
/// traitée chaque minute par le cron (ADR-016) ; ~5 min au total.
final exportPollDelays = List<Duration>.unmodifiable([
  const Duration(seconds: 2),
  const Duration(seconds: 3),
  const Duration(seconds: 5),
  ...List.filled(29, const Duration(seconds: 10)),
]);

/// L'écran a été quitté : plus aucune requête.
class ExportCancelled implements Exception {
  const ExportCancelled();
}

/// Crée la demande, attend qu'elle soit prête puis télécharge le fichier ;
/// [cancelled] est relu avant chaque requête.
Future<Uint8List> runExport(
  ExportJob job, {
  required List<Duration> delays,
  required Future<void> Function(Duration) sleep,
  required bool Function() cancelled,
}) async {
  void check() {
    if (cancelled()) throw const ExportCancelled();
  }

  var state = await job.start();
  for (final delay in delays) {
    if (state != ExportState.pending) break;
    await sleep(delay);
    check();
    state = await job.status();
  }
  if (state != ExportState.ready) throw ExportUnavailable(state);
  check();
  return job.download();
}
