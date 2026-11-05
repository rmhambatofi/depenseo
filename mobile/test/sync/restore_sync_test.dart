// Dépense supprimée ailleurs puis restaurée ici : la version locale part
// par PATCH même si l'horloge de l'appareil retarde (P6-06, ADR-051).
import 'package:depenseo/core/db/expense_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'sync_test_support.dart';

void main() {
  setUpSync();

  test(
    'conflit restauré : POST idempotent puis PATCH du contenu local',
    () async {
      server.putExpense(e1, {'amount': 100}); // 10:00 serveur
      server.route(e1);
      await engine.run(nb);

      // Supprimée ailleurs à 10:15, modifiée ici à 10:30 (hors ligne).
      serverNow = DateTime.utc(2026, 11, 5, 10, 15);
      server.expenses[e1]!['deletedAt'] = '2026-11-05T10:15:00.000Z';
      server.expenses[e1]!['updatedAt'] = '2026-11-05T10:15:00.000Z';
      await db.updateLocalExpense(
        e1,
        amount: 999,
        categoryId: food,
        date: '2026-11-05',
        note: 'gardée',
        merchant: null,
        tags: const [],
        now: DateTime.utc(2026, 11, 5, 10, 30),
      );
      serverNow = DateTime.utc(2026, 11, 5, 10, 40);
      await engine.run(nb);
      expect((await local(e1)).syncError, 'conflict');

      // Restauration à 12:00 serveur ; l'appareil, en retard, croit 10:45.
      serverNow = DateTime.utc(2026, 11, 5, 12);
      // Effet de `POST …/restore` côté serveur (réponse = ligne restaurée).
      server.putExpense(e1, {'deletedAt': null});
      await db.markExpenseRestored(
        e1,
        DateTime.utc(2026, 11, 5, 10, 45),
        server.expenses[e1]!['updatedAt']! as String,
      );
      serverNow = DateTime.utc(2026, 11, 5, 12, 1);
      await engine.run(nb);

      // 409 avant restauration, puis POST idempotent (ligne existante).
      expect(posts(), 2);
      expect(api.calls('PATCH /notebooks/$nb/expenses/$e1'), hasLength(1));
      expect(server.expenses[e1]!['amount'], 999);
      expect(server.expenses[e1]!['note'], 'gardée');
      final row = await local(e1);
      expect((row.amount, row.pendingSync, row.syncError), (999, false, null));
    },
  );
}
