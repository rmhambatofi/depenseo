// Réponses `GET …/dashboard` des tests de l'accueil (P6-10, ADR-055).
import '../expenses/quick_entry_harness.dart';
import '../limits/limit_harness.dart' show summary;

const dashboardPath = '/notebooks/$notebookId/dashboard';

Map<String, dynamic> upcoming({
  String id = '0190a000-0000-7000-8000-000000000e01',
  String name = 'Loyer',
  String dueDate = '2026-11-07',
  int amount = 85000,
  bool overdue = false,
}) => {
  'id': id,
  'recurringExpenseId': '0190a000-0000-7000-8000-000000000e00',
  'name': name,
  'dueDate': dueDate,
  'status': 'pending',
  'amount': amount,
  'adjusted': false,
  'currency': 'EUR',
  'amountKind': 'fixed',
  'awaitingConfirmation': false,
  'expenseId': null,
  'overdue': overdue,
};

Map<String, dynamic> point(int day, int cumulative, {String month = '11'}) => {
  'day': day,
  'date': '2026-$month-${day.toString().padLeft(2, '0')}',
  'cumulative': cumulative,
};

/// Douze périodes mensuelles, la période en cours d'abord (ordre de l'API).
List<Map<String, dynamic>> evolution(Map<String, dynamic> gauge) => [
  gauge,
  for (var i = 1; i < 12; i++)
    {
      ...gauge,
      'start': _monthStart(i),
      'end': _monthStart(i),
      'spent': 10000 * i,
    },
];

String _monthStart(int monthsAgo) {
  final index = 2026 * 12 + 10 - monthsAgo; // novembre 2026 = mois 10 (base 0)
  final m = (index % 12 + 1).toString().padLeft(2, '0');
  return '${index ~/ 12}-$m-01';
}

Map<String, dynamic> dashboard({
  int? limit = 50000,
  int spent = 31000,
  List<Map<String, dynamic>>? upcomingItems,
  List<Map<String, dynamic>>? categories,
  List<Map<String, dynamic>>? current,
  List<Map<String, dynamic>>? previous,
}) {
  final gauge = summary(limit: limit, spent: spent);
  return {
    'timeZone': 'Europe/Paris',
    'today': '2026-11-05',
    'gauge': gauge,
    'recent': <Object>[],
    'upcoming': upcomingItems ?? [upcoming()],
    'categories':
        categories ??
        [
          {'categoryId': food, 'total': 21000, 'percent': 68},
          {'categoryId': transport, 'total': 10000, 'percent': 32},
        ],
    'cumulative': {
      'current': current ?? [point(1, 5000), point(3, 20000), point(5, 31000)],
      'previous':
          previous ??
          [for (var d = 1; d <= 31; d++) point(d, d * 1000, month: '10')],
    },
    'evolution': evolution(gauge),
  };
}
