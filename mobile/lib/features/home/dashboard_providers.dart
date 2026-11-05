import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dashboard/dashboard_api.dart';
import '../../core/db/app_database.dart';
import '../../providers.dart';
import '../expenses/expense_providers.dart';

final dashboardApiProvider = Provider<DashboardApi>(
  (ref) => DashboardApi(ref.watch(apiClientProvider)),
);

/// Clé `app_meta` de la dernière réponse du tableau de bord d'un carnet
/// (purgée avec les autres carnets par la synchro, ADR-050).
String dashboardCacheKey(String notebookId) => 'dashboard.v1.$notebookId';

/// Tableau de bord affiché ; [stale] : dernière réponse enregistrée sur
/// l'appareil, l'API n'ayant pas répondu (NF-OFF-01).
class DashboardView {
  const DashboardView(this.dashboard, {required this.stale});

  final Dashboard dashboard;
  final bool stale;
}

/// Indicateurs de l'accueil (ADR-055) : jauge, échéances, graphiques lus en
/// ligne puis gardés dans la base chiffrée ; hors ligne, dernière réponse
/// gardée. Rechargés après chaque synchro réussie.
final dashboardProvider = FutureProvider.autoDispose<DashboardView>(
  retry: (_, _) => null,
  (ref) async {
    // Contexte d'abord : à l'ouverture de l'accueil, le marqueur de session
    // n'est posé qu'une fois le contexte du compte établi.
    final account = await ref.watch(accountContextProvider.future);
    final db = await ref.watch(databaseProvider.future);
    final epochs = ref.read(accountEpochProvider);
    final epoch = await epochs.read();
    if (epoch == null) throw const DashboardUnavailable();
    final key = dashboardCacheKey(account.notebookId);
    try {
      final (dashboard, raw) = await ref
          .read(dashboardApiProvider)
          .read(account.notebookId);
      // Réponse obtenue sous une autre session : ni affichée ni gardée.
      if (await epochs.read() != epoch) throw const DashboardUnavailable();
      await db.writeMeta(key, jsonEncode(raw));
      return DashboardView(dashboard, stale: false);
    } on DashboardUnavailable {
      if (await epochs.read() != epoch) rethrow;
      final cached = await db.readMeta(key);
      if (cached == null) rethrow;
      final Object? json;
      try {
        json = jsonDecode(cached);
      } on FormatException {
        throw const DashboardUnavailable();
      }
      return DashboardView(parseDashboard(json), stale: true);
    }
  },
);

/// Nom et couleur des catégories de la copie locale, par identifiant :
/// la répartition de l'API ne porte que l'identifiant.
final categoryLabelsProvider = Provider.autoDispose<Map<String, Category>>(
  (ref) => {
    for (final c in ref.watch(filterCategoriesProvider).value ?? <Category>[])
      c.id: c,
  },
);
