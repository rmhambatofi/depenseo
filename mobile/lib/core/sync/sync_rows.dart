part of 'sync_engine.dart';

// Correspondance lignes locales ↔ représentation de l'API (ADR-026, ADR-050).

Map<String, Object?> _fields(Expense row) => {
  'amount': row.amount,
  'currency': row.currency,
  'categoryId': row.categoryId,
  'date': row.date,
  'note': row.note,
  'merchant': row.merchant,
  'tags': _tags(row.tags),
};

bool _sameContent(Map<String, dynamic> remote, Expense row) {
  final local = _fields(row);
  for (final key in local.keys.where((k) => k != 'tags')) {
    if (remote[key] != local[key]) return false;
  }
  final a = [...(remote['tags'] as List).cast<String>()]..sort();
  final b = [...local['tags']! as List<String>]..sort();
  return a.length == b.length &&
      Iterable<int>.generate(a.length).every((i) => a[i] == b[i]);
}

/// La version locale en attente l'emporte-t-elle sur la version serveur
/// datée [remoteStamp] ? Oui si le serveur n'a pas changé depuis la version
/// dont elle part (`baseUpdatedAt`, `null` = créée ici) ; sinon conflit
/// réel : la plus récente par `updatedAt` gagne.
bool _localWins(
  Expense local,
  String remoteStamp, {
  bool remoteDeleted = false,
}) {
  final base = local.baseUpdatedAt;
  if (base == remoteStamp) return true;
  // Jamais reçue : la ligne distante est notre propre envoi (réponse
  // perdue), sauf si quelqu'un l'a supprimée depuis.
  if (base == null && !remoteDeleted) return true;
  return local.updatedAt.compareTo(remoteStamp) > 0;
}

ExpensesCompanion _expenseFromRemote(
  String notebookId,
  Map<String, dynamic> e,
) => ExpensesCompanion.insert(
  id: e['id'] as String,
  notebookId: notebookId,
  amount: e['amount'] as int,
  currency: e['currency'] as String,
  categoryId: e['categoryId'] as String,
  date: e['date'] as String,
  note: Value(e['note'] as String?),
  merchant: Value(e['merchant'] as String?),
  tags: Value(jsonEncode((e['tags'] as List).cast<String>())),
  createdAt: _stamp(e['createdAt']),
  updatedAt: _stamp(e['updatedAt']),
  deletedAt: Value(_stampOrNull(e['deletedAt'])),
  pendingSync: const Value(false),
  syncError: const Value(null),
  baseUpdatedAt: Value(_stamp(e['updatedAt'])),
);

class _Rejected implements Exception {
  const _Rejected();
}

class _Gone implements Exception {
  const _Gone();
}

/// Identifiants reçus pendant une synchro complète.
class _Seen {
  final categories = <String>{};
  final expenses = <String>{};

  /// Point de reprise, écrit seulement après le retrait des lignes absentes.
  String? nextSince;
}

Iterable<List<String>> _chunks(List<String> ids) sync* {
  for (var i = 0; i < ids.length; i += 500) {
    yield ids.sublist(i, i + 500 > ids.length ? ids.length : i + 500);
  }
}

List<String> _tags(String json) => (jsonDecode(json) as List).cast<String>();

/// Horodatage ISO 8601 UTC à la milliseconde (même forme que les écritures
/// locales), comparable comme chaîne.
String _stamp(Object? value) =>
    DateTime.parse(value! as String).toUtc().toIso8601String();

String? _stampOrNull(Object? value) => value == null ? null : _stamp(value);
