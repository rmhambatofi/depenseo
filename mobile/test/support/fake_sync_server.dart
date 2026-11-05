// Faux serveur des routes de dépenses et de synchro (ADR-026), branché sur
// `FakeApi` : reproduit l'insertion idempotente, le PATCH « dernier arrivé
// gagne », la suppression logique, la pagination par curseur et le 410.
import 'dart:io';

import 'fake_api.dart';

class FakeSyncServer {
  FakeSyncServer(this.api, this.notebookId, {required this.now}) {
    final base = '/notebooks/$notebookId';
    api
      ..on('POST $base/expenses', (r) => _guard(() => _create(r)))
      ..on('GET $base/sync', (r) => _guard(() => _sync(r)));
  }

  final FakeApi api;
  final String notebookId;

  /// Horloge du serveur (UTC).
  DateTime Function() now;

  final Map<String, Map<String, Object?>> categories = {};
  final Map<String, Map<String, Object?>> expenses = {};

  /// Panne réseau avant traitement.
  bool offline = false;

  /// La prochaine écriture est appliquée puis la réponse est perdue.
  bool loseNextResponse = false;

  /// Statut forcé pour la prochaine création (400, 422, 500…).
  int? failNextCreateWith;

  String _stamp() => now().toUtc().toIso8601String();

  FakeResponse _guard(FakeResponse Function() handle) {
    if (offline) throw const SocketException('offline');
    final response = handle();
    if (loseNextResponse && response.status < 300) {
      loseNextResponse = false;
      throw const SocketException('connexion coupée');
    }
    return response;
  }

  void addCategory(String id, String name, {String? deletedAt}) {
    final stamp = _stamp();
    categories[id] = {
      'id': id,
      'parentId': null,
      'systemKey': null,
      'name': name,
      'icon': 'cart',
      'color': '#43A047',
      'hidden': false,
      'position': categories.length,
      'createdAt': stamp,
      'updatedAt': stamp,
      'deletedAt': deletedAt,
    };
  }

  /// Écriture faite ailleurs (autre appareil) : `updatedAt` = maintenant.
  void putExpense(String id, Map<String, Object?> fields) {
    final stamp = _stamp();
    expenses[id] = {
      'id': id,
      'amount': 100,
      'currency': 'EUR',
      'categoryId': categories.keys.first,
      'date': '2026-11-05',
      'note': null,
      'merchant': null,
      'tags': <String>[],
      'source': 'manual',
      'createdAt': stamp,
      'deletedAt': null,
      ...expenses[id] ?? {},
      ...fields,
      'updatedAt': stamp,
    };
  }

  void _routeExpense(String id) {
    final path = '/notebooks/$notebookId/expenses/$id';
    api
      ..on('PATCH $path', (r) => _guard(() => _patch(id, r)))
      ..on('DELETE $path', (r) => _guard(() => _delete(id)));
  }

  Map<String, Object?> _view(Map<String, Object?> e) =>
      Map.of(e)..remove('deletedAt');

  FakeResponse _create(FakeRequest r) {
    final forced = failNextCreateWith;
    if (forced != null) {
      failNextCreateWith = null;
      return FakeResponse.problem(forced, 'forcé');
    }
    final body = r.body! as Map<String, dynamic>;
    final id = body['id'] as String;
    final existing = expenses[id];
    if (existing != null) {
      if (existing['deletedAt'] != null) {
        return FakeResponse.problem(409, 'Dépense supprimée');
      }
      return FakeResponse(201, _view(existing));
    }
    final category = categories[body['categoryId']];
    if (category == null || category['deletedAt'] != null) {
      return FakeResponse.problem(422, 'Catégorie invalide');
    }
    final stamp = _stamp();
    expenses[id] = {
      'id': id,
      'amount': body['amount'],
      'currency': body['currency'] ?? 'EUR',
      'categoryId': body['categoryId'],
      'date': body['date'],
      'note': _text(body['note']),
      'merchant': _text(body['merchant']),
      'tags': ([...(body['tags'] as List? ?? const [])]..sort()),
      'source': 'manual',
      'createdAt': stamp,
      'updatedAt': stamp,
      'deletedAt': null,
    };
    _routeExpense(id);
    return FakeResponse(201, _view(expenses[id]!));
  }

  FakeResponse _patch(String id, FakeRequest r) {
    final existing = expenses[id];
    if (existing == null || existing['deletedAt'] != null) {
      return FakeResponse.problem(404, 'Introuvable');
    }
    final body = Map<String, Object?>.of(r.body! as Map<String, dynamic>);
    for (final key in ['note', 'merchant']) {
      if (body.containsKey(key)) body[key] = _text(body[key]);
    }
    if (body['tags'] is List) {
      body['tags'] = [...(body['tags']! as List)]..sort();
    }
    putExpense(id, body);
    return FakeResponse(200, _view(expenses[id]!));
  }

  FakeResponse _delete(String id) {
    final existing = expenses[id];
    if (existing == null) return FakeResponse.problem(404, 'Introuvable');
    // Idempotent : une ligne déjà supprimée n'est pas retouchée.
    if (existing['deletedAt'] == null) {
      existing['deletedAt'] = _stamp();
      existing['updatedAt'] = _stamp();
    }
    return const FakeResponse(204);
  }

  /// Texte facultatif comme l'API : rogné, vide → `null`.
  static String? _text(Object? value) {
    final trimmed = (value as String?)?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  /// Rend les routes PATCH/DELETE d'une dépense créée par [putExpense].
  void route(String id) => _routeExpense(id);

  FakeResponse _sync(FakeRequest r) {
    final cursor = r.query['cursor'];
    final limit = int.parse(r.query['limit'] ?? '200');
    final DateTime? since;
    final DateTime watermark;
    var offset = 0;
    if (cursor != null) {
      final parts = cursor.split('|');
      offset = int.parse(parts[0]);
      since = parts[1].isEmpty ? null : DateTime.parse(parts[1]);
      watermark = DateTime.parse(parts[2]);
    } else {
      final raw = r.query['updated_since'];
      since = raw == null ? null : DateTime.parse(raw);
      if (since != null &&
          since.isBefore(now().subtract(const Duration(days: 29)))) {
        return FakeResponse.problem(410, 'Trop ancien');
      }
      watermark = now().subtract(const Duration(minutes: 5));
    }
    bool fresh(Map<String, Object?> row) =>
        since == null ||
        !DateTime.parse(row['updatedAt']! as String).isBefore(since);
    int byStamp(Map<String, Object?> a, Map<String, Object?> b) {
      final c = (a['updatedAt']! as String).compareTo(
        b['updatedAt']! as String,
      );
      return c != 0 ? c : (a['id']! as String).compareTo(b['id']! as String);
    }

    final all = [
      for (final c in categories.values.where(fresh).toList()..sort(byStamp))
        ('categories', c),
      for (final e in expenses.values.where(fresh).toList()..sort(byStamp))
        ('expenses', e),
    ];
    final page = all.skip(offset).take(limit).toList();
    final more = offset + page.length < all.length;
    return FakeResponse(200, {
      'categories': [
        for (final (t, row) in page)
          if (t == 'categories') row,
      ],
      'tags': <Object>[],
      'expenses': [
        for (final (t, row) in page)
          if (t == 'expenses') row,
      ],
      'limits': <Object>[],
      'recurringExpenses': <Object>[],
      'occurrences': <Object>[],
      'nextCursor': more
          ? '${offset + page.length}|${since?.toIso8601String() ?? ''}|'
                '${watermark.toIso8601String()}'
          : null,
      'nextUpdatedSince': watermark.toIso8601String(),
    });
  }
}
