import 'package:dio/dio.dart';

/// Fréquence d'une dépense récurrente (F-REC-01).
enum RecurrenceFrequency { weekly, monthly, quarterly, yearly, once }

/// Montant fixe, ou estimé (à ajuster à chaque échéance).
enum AmountKind { fixed, estimated }

/// À l'échéance : dépense enregistrée seule, ou demande de confirmation
/// (F-REC-02).
enum RecurrenceMode { auto, confirm }

enum OccurrenceStatus { pending, paid, skipped }

T _enum<T extends Enum>(List<T> values, Object? name) => values.firstWhere(
  (v) => v.name == name,
  // Valeur inconnue (API plus récente) : ne rien afficher de faux.
  orElse: () => throw FormatException('valeur inconnue : $name'),
);

/// Dépense récurrente telle que renvoyée par l'API (ADR-032).
class Recurring {
  const Recurring({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.amountKind,
    required this.frequency,
    required this.startDate,
    required this.categoryId,
    required this.mode,
    required this.remindThreeDaysBefore,
    required this.remindOnDueDate,
    required this.updatedAt,
  });

  factory Recurring.fromJson(Map<String, dynamic> j) => Recurring(
    id: j['id'] as String,
    name: j['name'] as String,
    amount: j['amount'] as int,
    currency: j['currency'] as String,
    amountKind: _enum(AmountKind.values, j['amountKind']),
    frequency: _enum(RecurrenceFrequency.values, j['frequency']),
    startDate: j['startDate'] as String,
    categoryId: j['categoryId'] as String,
    mode: _enum(RecurrenceMode.values, j['mode']),
    remindThreeDaysBefore: j['remindThreeDaysBefore'] as bool,
    remindOnDueDate: j['remindOnDueDate'] as bool,
    updatedAt: j['updatedAt'] as String,
  );

  final String id;
  final String name;

  /// En unités mineures (centimes).
  final int amount;
  final String currency;
  final AmountKind amountKind;
  final RecurrenceFrequency frequency;

  /// Première échéance (`AAAA-MM-JJ`) : porte le jour de la récurrence.
  final String startDate;
  final String categoryId;
  final RecurrenceMode mode;
  final bool remindThreeDaysBefore;
  final bool remindOnDueDate;
  final String updatedAt;

  /// Champs modifiables (PATCH), au format de l'API.
  Map<String, Object?> get editableFields => {
    'name': name,
    'amount': amount,
    'amountKind': amountKind.name,
    'categoryId': categoryId,
    'mode': mode.name,
    'remindThreeDaysBefore': remindThreeDaysBefore,
    'remindOnDueDate': remindOnDueDate,
  };

  /// Champs de [wanted] qui diffèrent des valeurs enregistrées.
  Map<String, Object?> changes(Map<String, Object?> wanted) {
    final saved = editableFields;
    return {
      for (final e in wanted.entries)
        if (saved[e.key] != e.value) e.key: e.value,
    };
  }
}

/// Échéance d'une récurrence, matérialisée par l'API (ADR-033).
class Occurrence {
  const Occurrence({
    required this.id,
    required this.recurringId,
    required this.name,
    required this.dueDate,
    required this.status,
    required this.amount,
    required this.adjusted,
    required this.currency,
    required this.amountKind,
    required this.awaitingConfirmation,
  });

  factory Occurrence.fromJson(Map<String, dynamic> j) => Occurrence(
    id: j['id'] as String,
    recurringId: j['recurringExpenseId'] as String,
    name: j['name'] as String,
    dueDate: j['dueDate'] as String,
    status: _enum(OccurrenceStatus.values, j['status']),
    amount: j['amount'] as int,
    adjusted: j['adjusted'] as bool,
    currency: j['currency'] as String,
    amountKind: _enum(AmountKind.values, j['amountKind']),
    awaitingConfirmation: j['awaitingConfirmation'] as bool,
  );

  final String id;
  final String recurringId;
  final String name;
  final String dueDate;
  final OccurrenceStatus status;

  /// Attendu (ajusté ou de la récurrence) ; payée : réel.
  final int amount;
  final bool adjusted;
  final String currency;
  final AmountKind amountKind;

  /// Échéance passée d'une récurrence « à confirmer » (F-REC-02).
  final bool awaitingConfirmation;
}

/// Récurrences, échéances en attente et heure des rappels, lues ensemble.
class RecurringOverview {
  const RecurringOverview({
    required this.recurring,
    required this.pending,
    required this.reminderTime,
  });

  /// Par nom (ordre de l'API).
  final List<Recurring> recurring;

  /// Échéances en attente de toutes les récurrences, par date d'échéance.
  final List<Occurrence> pending;

  /// Heure locale `HH:MM` des rappels d'échéance (F-REC-04, ADR-034).
  final String reminderTime;
}

/// Pourquoi une lecture ou une écriture de récurrence a échoué.
enum RecurringFailure {
  /// Réseau absent, serveur indisponible, session changée ou expirée.
  offline,

  /// Corps refusé (400/422) : catégorie supprimée, ponctuelle passée…
  invalid,

  /// Échéance déjà payée ou sautée, récurrence supprimée (404/409) :
  /// recharger.
  conflict,
}

class RecurringError implements Exception {
  const RecurringError(this.failure);

  final RecurringFailure failure;
}

/// Routes `…/recurring-expenses` et `…/occurrences` d'ADR-032, en ligne
/// seulement (ADR-054). Les échéances sont calculées par l'API (invariant 8).
class RecurringApi {
  RecurringApi(this._dio);

  final Dio _dio;

  String _base(String notebookId) => '/notebooks/$notebookId';

  Future<RecurringOverview> overview(String notebookId) => _guard(() async {
    final list = await _dio.get<List<dynamic>>(
      '${_base(notebookId)}/recurring-expenses',
    );
    final recurring = [
      for (final r in list.data!) Recurring.fromJson(r as Map<String, dynamic>),
    ];
    final occurrences = await Future.wait(
      recurring.map(
        (r) => _dio.get<List<dynamic>>(
          '${_base(notebookId)}/recurring-expenses/${r.id}/occurrences',
        ),
      ),
    );
    final pending = [
      for (final response in occurrences)
        for (final o in response.data!)
          Occurrence.fromJson(o as Map<String, dynamic>),
    ].where((o) => o.status == OccurrenceStatus.pending).toList();
    // Tri stable : date d'échéance puis nom.
    pending.sort((a, b) {
      final byDate = a.dueDate.compareTo(b.dueDate);
      return byDate != 0 ? byDate : a.name.compareTo(b.name);
    });
    final me = await _dio.get<Map<String, dynamic>>('/me');
    return RecurringOverview(
      recurring: recurring,
      pending: pending,
      reminderTime: me.data!['reminderTime'] as String,
    );
  });

  Future<void> create(String notebookId, Map<String, Object?> body) =>
      _guard(() async {
        await _dio.post<Map<String, dynamic>>(
          '${_base(notebookId)}/recurring-expenses',
          data: body,
        );
      });

  Future<void> update(
    String notebookId,
    String id,
    Map<String, Object?> patch,
  ) => _guard(() async {
    await _dio.patch<Map<String, dynamic>>(
      '${_base(notebookId)}/recurring-expenses/$id',
      data: patch,
    );
  });

  Future<void> delete(String notebookId, String id) => _guard(() async {
    await _dio.delete<void>('${_base(notebookId)}/recurring-expenses/$id');
  });

  /// [amount] nul : revenir au montant de la récurrence.
  Future<void> adjust(String notebookId, String occurrenceId, int? amount) =>
      _guard(() async {
        await _dio.patch<Map<String, dynamic>>(
          '${_base(notebookId)}/occurrences/$occurrenceId',
          data: {'amount': amount},
        );
      });

  /// Paie (ou confirme) l'échéance : l'API crée la dépense [expenseId]
  /// (rejouable, F-REC-02/03).
  Future<void> pay(
    String notebookId,
    String occurrenceId, {
    required String expenseId,
  }) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '${_base(notebookId)}/occurrences/$occurrenceId/pay',
      data: {'expenseId': expenseId},
    );
  });

  Future<void> skip(String notebookId, String occurrenceId) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '${_base(notebookId)}/occurrences/$occurrenceId/skip',
    );
  });

  /// Heure locale `HH:MM` de tous les rappels d'échéance du compte.
  Future<void> setReminderTime(String time) => _guard(() async {
    await _dio.patch<Map<String, dynamic>>('/me', data: {'reminderTime': time});
  });

  Future<T> _guard<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on DioException catch (e) {
      throw RecurringError(switch (e.response?.statusCode) {
        400 || 422 => RecurringFailure.invalid,
        404 || 409 => RecurringFailure.conflict,
        // Réseau, 5xx, 401, 403.
        _ => RecurringFailure.offline,
      });
    } on FormatException {
      throw const RecurringError(RecurringFailure.offline);
    } on TypeError {
      // Champ absent ou d'un autre type : réponse inattendue.
      throw const RecurringError(RecurringFailure.offline);
    }
  }
}
