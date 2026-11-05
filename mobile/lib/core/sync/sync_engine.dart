import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';

import '../db/app_database.dart';

part 'sync_rows.dart';

/// Réseau absent, serveur indisponible ou carnet momentanément inaccessible :
/// rien n'est perdu, la synchro sera relancée plus tard.
class SyncUnavailable implements Exception {
  const SyncUnavailable();
}

class SyncReport {
  const SyncReport({
    required this.sent,
    required this.rejected,
    required this.received,
  });

  /// Lignes acceptées par l'API (créées, modifiées ou supprimées).
  final int sent;

  /// Lignes refusées (400/422), gardées localement et marquées.
  final int rejected;

  /// Lignes reçues (catégories et dépenses).
  final int received;
}

/// Version du format local de la synchro : l'incrémenter (nouvelle table
/// locale alimentée par la synchro) force une synchro complète.
const syncFormat = 'v1';

String sinceKey(String notebookId) => 'sync.$syncFormat.$notebookId.since';

/// Synchro hors ligne d'abord (NF-OFF-01, ADR-050) : envoie la file des
/// dépenses `pending_sync` (insert idempotent par UUID v7), puis lit les
/// changements du carnet par `GET /sync` (ADR-026). Conflits : la version
/// au `updatedAt` le plus récent gagne.
class SyncEngine {
  SyncEngine(this._dio, this._db, {this.pageSize = 200, this.stillCurrent});

  final Dio _dio;
  final AppDatabase _db;
  final int pageSize;

  /// Session inchangée depuis le début du passage ? Relu après chaque réponse,
  /// avant d'en tirer quoi que ce soit : une réponse obtenue avec le jeton
  /// d'un autre compte (404 du carnet…) n'acquitte rien.
  final Future<bool> Function()? stillCurrent;

  Future<void> _assertCurrent() async {
    final check = stillCurrent;
    if (check != null && !await check()) throw const SyncUnavailable();
  }

  Future<SyncReport> run(String notebookId) async {
    await _purgeOtherNotebooks(notebookId);
    final (sent, rejected) = await _push(notebookId);
    final received = await _pull(notebookId);
    return SyncReport(sent: sent, rejected: rejected, received: received);
  }

  // ---------------------------------------------------------------- envoi

  Future<(int, int)> _push(String notebookId) async {
    final queue =
        await (_db.select(_db.expenses)
              ..where(
                (e) =>
                    e.notebookId.equals(notebookId) &
                    e.pendingSync.equals(true) &
                    e.syncError.isNull(),
              )
              ..orderBy([(e) => OrderingTerm.asc(e.updatedAt)]))
            .get();
    var sent = 0;
    var rejected = 0;
    for (final row in queue) {
      try {
        await _send(notebookId, row);
        sent++;
      } on _Rejected {
        await _mark(row, const ExpensesCompanion(syncError: Value('rejected')));
        rejected++;
      }
    }
    return (sent, rejected);
  }

  Future<void> _send(String notebookId, Expense row) async {
    final base = '/notebooks/$notebookId/expenses';
    if (row.deletedAt != null) {
      // Suppression logique idempotente ; 404 = jamais arrivée au serveur.
      await _call(() => _dio.delete<void>('$base/${row.id}'), accept: {404});
      await _mark(row, const ExpensesCompanion(pendingSync: Value(false)));
      return;
    }
    final created = await _call(
      () => _dio.post<Map<String, dynamic>>(
        base,
        data: {'id': row.id, ..._fields(row)},
      ),
      accept: {409},
    );
    if (created.statusCode == 409) {
      // Identifiant déjà pris ou dépense supprimée sur le serveur : la ligne
      // est gardée et marquée ; la réception arbitre une suppression distante.
      await _mark(row, const ExpensesCompanion(syncError: Value('conflict')));
      return;
    }
    var remote = created.data!;
    if (!_sameContent(remote, row)) {
      // La ligne existait déjà (rejeu ou modification locale ultérieure).
      if (!_localWins(row, _stamp(remote['updatedAt']))) {
        await _adopt(row, remote);
        return;
      }
      final patched = await _call(
        () => _dio.patch<Map<String, dynamic>>(
          '$base/${row.id}',
          data: _fields(row),
        ),
      );
      remote = patched.data!;
    }
    await _adopt(row, remote);
  }

  /// Remplace la ligne par la version de l'API, sauf si elle a été modifiée
  /// localement entre-temps (elle reste alors en attente).
  Future<void> _adopt(Expense sentRow, Map<String, dynamic> remote) =>
      _db.transaction(() async {
        final updated = await _mark(
          sentRow,
          _expenseFromRemote(sentRow.notebookId, {
            ...remote,
            'deletedAt': null,
            'createdAt': remote['createdAt'] ?? sentRow.createdAt,
          }),
        );
        if (updated == 0) {
          // Modifiée pendant l'envoi : elle repose désormais sur la version
          // que l'on vient d'écrire, pas sur un conflit avec soi-même.
          await (_db.update(
            _db.expenses,
          )..where((e) => e.id.equals(sentRow.id))).write(
            ExpensesCompanion(
              baseUpdatedAt: Value(_stamp(remote['updatedAt'])),
            ),
          );
        }
      });

  /// Mise à jour conditionnelle : seulement si la ligne n'a pas changé depuis
  /// sa lecture (même `updatedAt`).
  Future<int> _mark(Expense row, ExpensesCompanion changes) =>
      (_db.update(_db.expenses)..where(
            (e) => e.id.equals(row.id) & e.updatedAt.equals(row.updatedAt),
          ))
          .write(changes);

  Future<Response<T>> _call<T>(
    Future<Response<T>> Function() request, {
    Set<int> accept = const {},
  }) async {
    try {
      final response = await request();
      await _assertCurrent();
      return response;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401) rethrow;
      await _assertCurrent();
      if (status != null && accept.contains(status)) {
        return Response<T>(
          requestOptions: e.requestOptions,
          statusCode: status,
        );
      }
      if (status == 400 || status == 422) throw const _Rejected();
      // Réseau, 5xx, 403/404 (carnet inaccessible, changement de compte…).
      throw const SyncUnavailable();
    }
  }

  // ------------------------------------------------------------- réception

  Future<int> _pull(String notebookId) async {
    final since = await _db.readMeta(sinceKey(notebookId));
    try {
      return await _walk(notebookId, since);
    } on _Gone {
      if (since == null) throw const SyncUnavailable();
      // Suppressions purgées côté serveur : synchro complète, puis retrait
      // des seules lignes synchronisées absentes (rien n'est effacé avant).
      final seen = _Seen();
      // Point de reprise écrit après le retrait seulement : une interruption
      // entre les deux refait tout le parcours (410 de nouveau).
      final received = await _walk(notebookId, null, seen);
      await _forgetUnseen(notebookId, seen);
      await _db.writeMeta(sinceKey(notebookId), seen.nextSince!);
      return received;
    }
  }

  Future<int> _walk(String notebookId, String? since, [_Seen? seen]) async {
    var received = 0;
    String? cursor;
    String nextSince;
    do {
      final Response<Map<String, dynamic>> response;
      try {
        response = await _dio.get<Map<String, dynamic>>(
          '/notebooks/$notebookId/sync',
          queryParameters: {
            'limit': pageSize,
            if (cursor != null) 'cursor': cursor else 'updated_since': ?since,
          },
        );
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        if (status == 401) rethrow;
        await _assertCurrent();
        if (status == 410) throw const _Gone();
        throw const SyncUnavailable();
      }
      await _assertCurrent();
      final page = response.data!;
      received += await _apply(notebookId, page, seen);
      cursor = page['nextCursor'] as String?;
      nextSince = _stamp(page['nextUpdatedSince']);
    } while (cursor != null);
    if (seen == null) {
      await _db.writeMeta(sinceKey(notebookId), nextSince);
    } else {
      seen.nextSince = nextSince;
    }
    return received;
  }

  Future<int> _apply(
    String notebookId,
    Map<String, dynamic> page,
    _Seen? seen,
  ) => _db.transaction(() async {
    final categories = (page['categories'] as List)
        .cast<Map<String, dynamic>>();
    final expenses = (page['expenses'] as List).cast<Map<String, dynamic>>();
    seen?.categories.addAll(categories.map((c) => c['id'] as String));
    seen?.expenses.addAll(expenses.map((e) => e['id'] as String));
    for (final c in categories) {
      await _db
          .into(_db.categories)
          .insertOnConflictUpdate(
            CategoriesCompanion.insert(
              id: c['id'] as String,
              notebookId: notebookId,
              parentId: Value(c['parentId'] as String?),
              systemKey: Value(c['systemKey'] as String?),
              name: c['name'] as String,
              icon: c['icon'] as String,
              color: c['color'] as String,
              position: Value(c['position'] as int),
              hidden: Value(c['hidden'] as bool),
              updatedAt: _stamp(c['updatedAt']),
              deletedAt: Value(_stampOrNull(c['deletedAt'])),
            ),
          );
    }
    for (final e in expenses) {
      final local = await (_db.select(
        _db.expenses,
      )..where((x) => x.id.equals(e['id'] as String))).getSingleOrNull();
      // Modification locale en attente qui l'emporte : gardée (envoyée
      // au prochain passage ; un conflit marqué est de nouveau tenté).
      if (local != null &&
          local.pendingSync &&
          _localWins(
            local,
            _stamp(e['updatedAt']),
            remoteDeleted: e['deletedAt'] != null,
          )) {
        if (local.syncError == 'conflict' && e['deletedAt'] == null) {
          await _mark(
            local,
            ExpensesCompanion(
              syncError: const Value(null),
              baseUpdatedAt: Value(_stamp(e['updatedAt'])),
            ),
          );
        }
        continue;
      }
      await _db
          .into(_db.expenses)
          .insertOnConflictUpdate(_expenseFromRemote(notebookId, e));
    }
    return categories.length + expenses.length;
  });

  /// Après la synchro complète qui suit un 410 : retire les lignes
  /// synchronisées que le serveur n'a plus (suppressions purgées).
  Future<void> _forgetUnseen(String notebookId, _Seen seen) async {
    final localExpenses =
        await (_db.selectOnly(_db.expenses)
              ..addColumns([_db.expenses.id])
              ..where(
                _db.expenses.notebookId.equals(notebookId) &
                    _db.expenses.pendingSync.equals(false),
              ))
            .map((r) => r.read(_db.expenses.id)!)
            .get();
    final localCategories =
        await (_db.selectOnly(_db.categories)
              ..addColumns([_db.categories.id])
              ..where(_db.categories.notebookId.equals(notebookId)))
            .map((r) => r.read(_db.categories.id)!)
            .get();
    final staleExpenses = localExpenses.where(
      (id) => !seen.expenses.contains(id),
    );
    final staleCategories = localCategories.where(
      (id) => !seen.categories.contains(id),
    );
    await _db.transaction(() async {
      for (final chunk in _chunks(staleExpenses.toList())) {
        await (_db.delete(
          _db.expenses,
        )..where((e) => e.id.isIn(chunk) & e.pendingSync.equals(false))).go();
      }
      for (final chunk in _chunks(staleCategories.toList())) {
        await (_db.delete(_db.categories)..where((c) => c.id.isIn(chunk))).go();
      }
    });
  }

  /// Copie d'un autre carnet (compte précédent) : effacée si elle est sur le
  /// serveur ; les saisies jamais envoyées restent, invisibles, pour leur
  /// propriétaire (ADR-050).
  Future<void> _purgeOtherNotebooks(String notebookId) => _db.transaction(
    () async {
      await (_db.delete(_db.expenses)..where(
            (e) =>
                e.notebookId.equals(notebookId).not() &
                e.pendingSync.equals(false),
          ))
          .go();
      await (_db.delete(
        _db.categories,
      )..where((c) => c.notebookId.equals(notebookId).not())).go();
      // Leurs points de reprise aussi : un retour du compte refait une
      // synchro complète.
      await (_db.delete(_db.appMeta)..where(
            (m) =>
                m.key.like('sync.%') & m.key.equals(sinceKey(notebookId)).not(),
          ))
          .go();
      // Dernier tableau de bord gardé des autres carnets (ADR-055).
      await (_db.delete(_db.appMeta)..where(
            (m) =>
                m.key.like('dashboard.%') &
                m.key.like('dashboard.%.$notebookId').not(),
          ))
          .go();
    },
  );
}
