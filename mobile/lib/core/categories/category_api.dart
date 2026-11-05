import 'package:dio/dio.dart';

/// Pourquoi une écriture de catégorie a échoué.
enum CategoryWriteFailure {
  /// Réseau absent, serveur indisponible, carnet inaccessible.
  offline,

  /// Corps refusé (400) ou catégorie parente invalide (422).
  invalid,

  /// Catégorie modifiée introuvable ou supprimée ailleurs (404/409 d'un PATCH).
  gone,
}

class CategoryWriteError implements Exception {
  const CategoryWriteError(this.failure);

  final CategoryWriteFailure failure;
}

/// Écritures des catégories, en ligne seulement (ADR-052) : les routes
/// `…/categories` d'ADR-023. Renvoie la catégorie de l'API (`CategoryDto`).
class CategoryApi {
  CategoryApi(this._dio);

  final Dio _dio;

  /// Création idempotente par [id] (UUID v7 tiré sur l'appareil).
  Future<Map<String, dynamic>> create(
    String notebookId, {
    required String id,
    required String name,
    required String icon,
    required String color,
    String? parentId,
  }) => _call(
    creating: true,
    () => _dio.post<Map<String, dynamic>>(
      '/notebooks/$notebookId/categories',
      data: {
        'id': id,
        'name': name,
        'icon': icon,
        'color': color,
        'parentId': parentId,
      },
    ),
  );

  /// Modification partielle : seuls les champs non nuls sont envoyés.
  Future<Map<String, dynamic>> update(
    String notebookId,
    String id, {
    String? name,
    String? icon,
    String? color,
    bool? hidden,
  }) => _call(
    () => _dio.patch<Map<String, dynamic>>(
      '/notebooks/$notebookId/categories/$id',
      data: {'name': ?name, 'icon': ?icon, 'color': ?color, 'hidden': ?hidden},
    ),
  );

  Future<Map<String, dynamic>> _call(
    Future<Response<Map<String, dynamic>>> Function() request, {
    bool creating = false,
  }) async {
    try {
      return (await request()).data!;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401) rethrow;
      throw CategoryWriteError(switch (status) {
        // Création : 409 = identifiant déjà pris ailleurs.
        400 || 422 => CategoryWriteFailure.invalid,
        409 when creating => CategoryWriteFailure.invalid,
        404 || 409 when !creating => CategoryWriteFailure.gone,
        // Réseau, 5xx, 403/404 du carnet (changement de compte…).
        _ => CategoryWriteFailure.offline,
      });
    }
  }
}
