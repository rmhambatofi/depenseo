// Limites de dépenses (F-LIM-01/02/03/05/09, ADR-053) : modèles lus depuis
// l'API. Aucun calcul de période ni de jauge ici (invariant 8) : l'appareil
// affiche ce que `GET …/limits/current` renvoie.

enum LimitPeriodKind {
  month,
  week;

  /// Lève [FormatException] sur une valeur inconnue.
  static LimitPeriodKind parse(String value) => switch (value) {
    'month' => LimitPeriodKind.month,
    'week' => LimitPeriodKind.week,
    _ => throw FormatException('periodKind', value),
  };
}

/// Période courante calculée par l'API (`PeriodSummaryDto`).
class PeriodSummary {
  const PeriodSummary({
    required this.start,
    required this.end,
    required this.periodKind,
    required this.startDay,
    required this.limit,
    required this.currency,
    required this.includeRecurring,
    required this.spent,
    required this.remaining,
    required this.consumedPercent,
    required this.elapsedPercent,
  });

  factory PeriodSummary.fromJson(Map<String, dynamic> json) => PeriodSummary(
    start: json['start'] as String,
    end: json['end'] as String,
    periodKind: LimitPeriodKind.parse(json['periodKind'] as String),
    startDay: json['startDay'] as int,
    limit: json['limit'] as int?,
    currency: json['currency'] as String,
    includeRecurring: json['includeRecurring'] as bool,
    spent: json['spent'] as int,
    remaining: json['remaining'] as int?,
    consumedPercent: json['consumedPercent'] as int?,
    elapsedPercent: json['elapsedPercent'] as int,
  );

  /// Dates calendaires `AAAA-MM-JJ`, bornes incluses.
  final String start;
  final String end;
  final LimitPeriodKind periodKind;
  final int startDay;

  /// Unités mineures ; `null` : aucune limite pour cette période.
  final int? limit;
  final String currency;
  final bool includeRecurring;
  final int spent;
  final int? remaining;
  final int? consumedPercent;
  final int elapsedPercent;
}

/// Version d'une limite (`LimitDto`). [amount] `null` : « aucune limite ».
class LimitVersion {
  const LimitVersion({
    required this.id,
    required this.amount,
    required this.periodKind,
    required this.startDay,
    required this.includeRecurring,
    required this.effectiveDate,
    required this.appliesFrom,
    required this.updatedAt,
  });

  factory LimitVersion.fromJson(Map<String, dynamic> json) => LimitVersion(
    id: json['id'] as String,
    amount: json['amount'] as int?,
    periodKind: LimitPeriodKind.parse(json['periodKind'] as String),
    startDay: json['startDay'] as int,
    includeRecurring: json['includeRecurring'] as bool,
    effectiveDate: json['effectiveDate'] as String,
    appliesFrom: json['appliesFrom'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final int? amount;
  final LimitPeriodKind periodKind;
  final int startDay;
  final bool includeRecurring;
  final String effectiveDate;
  final String appliesFrom;
  final String updatedAt;

  LimitSettings get settings => LimitSettings(
    amount: amount,
    periodKind: periodKind,
    startDay: startDay,
    includeRecurring: includeRecurring,
  );
}

/// Réglages saisis dans l'écran des limites.
class LimitSettings {
  const LimitSettings({
    required this.amount,
    required this.periodKind,
    required this.startDay,
    required this.includeRecurring,
  });

  /// Pas encore de version : aucune limite, mois commençant le 1er (défauts
  /// de l'API).
  static const initial = LimitSettings(
    amount: null,
    periodKind: LimitPeriodKind.month,
    startDay: 1,
    includeRecurring: true,
  );

  final int? amount;
  final LimitPeriodKind periodKind;
  final int startDay;
  final bool includeRecurring;

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'periodKind': periodKind.name,
    'startDay': startDay,
    'includeRecurring': includeRecurring,
  };

  @override
  bool operator ==(Object other) =>
      other is LimitSettings &&
      other.amount == amount &&
      other.periodKind == periodKind &&
      other.startDay == startDay &&
      other.includeRecurring == includeRecurring;

  @override
  int get hashCode =>
      Object.hash(amount, periodKind, startDay, includeRecurring);
}

/// Écriture à faire pour enregistrer des réglages (F-LIM-09 : l'historique
/// n'est jamais réécrit, l'API n'accepte qu'une version par jour).
sealed class LimitWrite {
  const LimitWrite();
}

/// Rien n'a changé.
class LimitUnchanged extends LimitWrite {
  const LimitUnchanged();
}

/// Nouvelle version datée du jour par l'API.
class LimitCreate extends LimitWrite {
  const LimitCreate(this.body);

  final Map<String, dynamic> body;
}

/// La dernière version date d'aujourd'hui : on la modifie (champs changés).
class LimitPatch extends LimitWrite {
  const LimitPatch(this.id, this.body);

  final String id;
  final Map<String, dynamic> body;
}

/// [last] : version la plus récente (par date d'effet) ; [today] : jour du
/// compte selon l'API ; [newId] : UUID v7 tiré une fois par formulaire.
LimitWrite planLimitWrite({
  required LimitVersion? last,
  required String today,
  required LimitSettings wanted,
  required String newId,
}) {
  final current = last?.settings ?? LimitSettings.initial;
  if (wanted == current) return const LimitUnchanged();
  if (last != null && last.effectiveDate == today) {
    final before = current.toJson();
    final changed = {
      for (final MapEntry(:key, :value) in wanted.toJson().entries)
        if (before[key] != value) key: value,
    };
    return LimitPatch(last.id, changed);
  }
  return LimitCreate({'id': newId, ...wanted.toJson()});
}
