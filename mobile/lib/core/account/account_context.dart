import 'package:dio/dio.dart';

import '../db/app_database.dart';
import '../money/amount_input.dart';

/// Ce qu'il faut savoir du compte pour saisir hors ligne : carnet personnel,
/// devise par défaut (ADR-024) et fuseau du calcul de « aujourd'hui » (NF-FMT-04).
class AccountContext {
  const AccountContext({
    required this.userId,
    required this.notebookId,
    required this.currency,
    required this.timeZone,
  });

  final String userId;
  final String notebookId;
  final String currency;
  final String timeZone;
}

class AccountContextUnavailable implements Exception {
  const AccountContextUnavailable();
}

/// Dernière catégorie choisie (ignorée si absente du carnet courant).
const quickEntryLastCategoryKey = 'quick_entry.last_category';

const _keys = (
  epoch: 'account.epoch',
  userId: 'account.user_id',
  notebookId: 'account.notebook_id',
  currency: 'account.currency',
  timeZone: 'account.time_zone',
);

/// Copie locale d'abord (saisie immédiate, hors ligne), rafraîchie en tâche
/// de fond par `GET /me` + `GET /notebooks` ; sans copie, lecture réseau
/// (ADR-049). La copie n'est servie que sous le marqueur de session qui l'a
/// produite (`AccountEpoch`) : jamais à un autre compte. Lève
/// [AccountContextUnavailable] si aucune source ne répond.
class AccountContextRepository {
  AccountContextRepository(this._dio, this._db, {required this.currentEpoch});

  final Dio _dio;
  final AppDatabase _db;

  /// Marqueur de la session en cours, relu avant d'écrire la copie : une
  /// réponse arrivée après un changement de compte n'écrase rien.
  final Future<String?> Function() currentEpoch;

  static const timeout = Duration(seconds: 5);

  /// [refreshed] reçoit le rafraîchissement lancé en tâche de fond (tests).
  Future<AccountContext> load(
    String epoch, {
    void Function(Future<void> refresh)? refreshed,
  }) async {
    final cached = await _cached(epoch);
    if (cached != null) {
      final refresh = refreshInBackground(epoch);
      refreshed?.call(refresh);
      return cached;
    }
    try {
      return await _fetchAndSave(epoch);
    } on DioException catch (e) {
      // Session refusée : le client HTTP a déjà conclu à l'expiration.
      if (e.response?.statusCode == 401) rethrow;
      throw const AccountContextUnavailable();
    }
  }

  /// Ne lève jamais : un échec garde la copie existante.
  Future<void> refreshInBackground(String epoch) async {
    try {
      await _fetchAndSave(epoch);
    } on Object {
      // Hors ligne ou réponse inattendue : la copie reste valable.
    }
  }

  Future<AccountContext> _fetchAndSave(String epoch) async {
    final fresh = await _fetch();
    if (await currentEpoch() != epoch) throw const AccountContextUnavailable();
    await _save(epoch, fresh);
    return fresh;
  }

  Future<AccountContext> _fetch() async {
    final options = Options(receiveTimeout: timeout, sendTimeout: timeout);
    final responses = await Future.wait([
      _dio.get<Map<String, dynamic>>('/me', options: options),
      _dio.get<List<dynamic>>('/notebooks', options: options),
    ], eagerError: true);
    try {
      return _parse(
        (responses[0] as Response<Map<String, dynamic>>).data!,
        (responses[1] as Response<List<dynamic>>).data!,
      );
    } on TypeError {
      // Réponse d'une forme inattendue.
      throw const AccountContextUnavailable();
    }
  }

  AccountContext _parse(Map<String, dynamic> me, List<dynamic> notebooks) {
    final personal = notebooks.cast<Map<String, dynamic>>().firstWhere(
      (n) => n['kind'] == 'personal',
      orElse: () => throw const AccountContextUnavailable(),
    );
    final currency = me['currency'] as String;
    if (!minorUnits.containsKey(currency)) {
      throw const AccountContextUnavailable();
    }
    return AccountContext(
      userId: me['id'] as String,
      notebookId: personal['id'] as String,
      currency: currency,
      timeZone: me['timeZone'] as String,
    );
  }

  Future<void> _save(String epoch, AccountContext c) =>
      _db.transaction(() async {
        await _db.writeMeta(_keys.epoch, epoch);
        await _db.writeMeta(_keys.userId, c.userId);
        await _db.writeMeta(_keys.notebookId, c.notebookId);
        await _db.writeMeta(_keys.currency, c.currency);
        await _db.writeMeta(_keys.timeZone, c.timeZone);
      });

  /// Lecture en transaction : jamais un mélange de deux copies.
  Future<AccountContext?> _cached(String epoch) =>
      _db.transaction(() => _readCopy(epoch));

  Future<AccountContext?> _readCopy(String epoch) async {
    if (await _db.readMeta(_keys.epoch) != epoch) return null;
    final userId = await _db.readMeta(_keys.userId);
    final notebookId = await _db.readMeta(_keys.notebookId);
    final currency = await _db.readMeta(_keys.currency);
    final timeZone = await _db.readMeta(_keys.timeZone);
    if (userId == null ||
        notebookId == null ||
        currency == null ||
        timeZone == null) {
      return null;
    }
    return AccountContext(
      userId: userId,
      notebookId: notebookId,
      currency: currency,
      timeZone: timeZone,
    );
  }
}
