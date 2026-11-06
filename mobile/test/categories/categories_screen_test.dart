// Gestion des catégories sur l'appareil (P6-07, F-CAT-01/02, ADR-052).
import 'package:depenseo/core/account/account_epoch.dart';
import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/core/db/category_store.dart';
import 'package:depenseo/features/categories/category_providers.dart';
import 'package:depenseo/ui/category_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../expenses/quick_entry_harness.dart';
import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/test_app.dart';

Finder byKey(String key) => find.byKey(Key(key));

/// Le bouton suit la grille d'icônes : retirer une éventuelle SnackBar (qui
/// le couvrirait en bas d'écran), le faire défiler à l'écran, le toucher.
Future<void> tapSave(WidgetTester tester) async {
  final button = byKey('save-category');
  ScaffoldMessenger.of(tester.element(button)).removeCurrentSnackBar();
  await tester.pump();
  await tester.ensureVisible(button);
  await tester.tap(button);
}

/// Clé de la tuile d'icône sélectionnée dans le formulaire de catégorie.
String selectedIcon(WidgetTester tester) {
  final selected = find.byWidgetPredicate(
    (w) =>
        w is Semantics &&
        w.properties.selected == true &&
        w.child is InkWell &&
        ((w.child! as InkWell).key as ValueKey<String>?)?.value.startsWith(
              'icon-',
            ) ==
            true,
  );
  expect(selected, findsOneWidget);
  return ((tester.widget<Semantics>(selected).child! as InkWell).key!
          as ValueKey<String>)
      .value;
}

const base = '/notebooks/$notebookId/categories';
const hiddenChild = '0190a000-0000-7000-8000-0000000000c1';

/// Réponse `CategoryDto` de l'API pour la ligne locale [c] modifiée par [patch].
Map<String, dynamic> echo(Category c, Map<String, dynamic> patch) => {
  'id': c.id,
  'parentId': c.parentId,
  'systemKey': c.systemKey,
  'name': c.name,
  'icon': c.icon,
  'color': c.color,
  'hidden': c.hidden,
  ...patch,
};

Future<(TestApp, AppDatabase)> openCategories(WidgetTester tester) async {
  final app = await startSignedIn(tester);
  final db = await database(app, tester);
  await tester.tap(byKey('open-settings'));
  await tester.pumpAndSettle();
  await tester.tap(byKey('open-categories'));
  await pumpIo(tester, until: byKey('category-tile-$food'));
  return (app, db);
}

Future<Category> load(AppDatabase db, WidgetTester tester, String id) async =>
    (await io<Category?>(tester, () => db.categoryById(id)))!;

/// Le faux serveur applique le PATCH sur la version locale de la ligne.
void servePatch(TestApp app, AppDatabase db, WidgetTester tester, String id) =>
    app.api.on('PATCH $base/$id', (r) async {
      final c = (await db.categoryById(id))!;
      return FakeResponse(200, echo(c, r.body! as Map<String, dynamic>));
    });

void main() {
  testWidgets('plan du carnet : racines puis sous-catégories, masquées '
      'signalées, supprimées absentes', (tester) async {
    await openCategories(tester);
    for (final name in ['Alimentation', 'Courses', 'Transport', 'Masquée']) {
      expect(find.text(name), findsOneWidget);
    }
    expect(
      find.descendant(
        of: byKey('category-tile-$hiddenChild'),
        matching: find.text(
          'Non proposée à la saisie : sa catégorie parente est masquée',
        ),
      ),
      findsOneWidget,
    );
    expect(find.text('Supprimée'), findsNothing);
    // Sous-catégorie juste sous sa racine.
    final y = tester.getTopLeft(byKey('category-tile-$food')).dy;
    final yChild = tester.getTopLeft(byKey('category-tile-$groceries')).dy;
    final yNext = tester.getTopLeft(byKey('category-tile-$transport')).dy;
    expect(y < yChild && yChild < yNext, isTrue);
    expect(
      find.descendant(
        of: byKey('category-tile-$hiddenRoot'),
        matching: find.text('Masquée : non proposée à la saisie'),
      ),
      findsOneWidget,
    );
    expect(
      tester.widget<Switch>(byKey('category-visible-$hiddenRoot')).value,
      isFalse,
    );
    expect(
      tester.widget<Switch>(byKey('category-visible-$food')).value,
      isTrue,
    );
  });

  testWidgets('masquer puis réafficher : PATCH hidden, retirée puis rendue '
      'à la saisie', (tester) async {
    final (app, db) = await openCategories(tester);
    servePatch(app, db, tester, transport);

    await tester.tap(byKey('category-visible-$transport'));
    await settle(
      tester,
      find.descendant(
        of: byKey('category-tile-$transport'),
        matching: find.text('Masquée : non proposée à la saisie'),
      ),
    );
    expect(app.api.calls('PATCH $base/$transport').single.body, {
      'hidden': true,
    });
    expect((await load(db, tester, transport)).hidden, isTrue);
    final offered = await io(tester, () => db.selectableCategories(notebookId));
    expect(offered.map((c) => c.id), isNot(contains(transport)));

    await tester.tap(byKey('category-visible-$transport'));
    await settleUntil(
      tester,
      () => tester.widget<Switch>(byKey('category-visible-$transport')).value,
    );
    expect(app.api.calls('PATCH $base/$transport').last.body, {
      'hidden': false,
    });
    expect((await load(db, tester, transport)).hidden, isFalse);
    expect(
      tester.widget<Switch>(byKey('category-visible-$transport')).value,
      isTrue,
    );
  });

  testWidgets('hors connexion : masquage refusé avec message, rien ne change', (
    tester,
  ) async {
    final (app, db) = await openCategories(tester);
    app.api.on(
      'PATCH $base/$transport',
      (_) => throw const SocketExceptionLike(),
    );

    await tester.tap(byKey('category-visible-$transport'));
    await settle(tester, find.textContaining('Connexion requise'));
    expect((await load(db, tester, transport)).hidden, isFalse);
    expect(
      tester.widget<Switch>(byKey('category-visible-$transport')).value,
      isTrue,
    );
  });

  testWidgets('personnaliser nom, icône et couleur : seuls les champs '
      'modifiés sont envoyés', (tester) async {
    final (app, db) = await openCategories(tester);
    servePatch(app, db, tester, groceries);

    await tester.tap(byKey('category-tile-$groceries'));
    await pumpIo(tester, until: byKey('category-name'));
    expect(find.text('Courses'), findsOneWidget);
    // Pas de choix du parent en modification.
    expect(byKey('category-parent'), findsNothing);

    await enter(tester, 'category-name', '  Marché  ');
    // Icône actuelle hors catalogue (emoji) : proposée et sélectionnée.
    expect(selectedIcon(tester), 'icon-custom');
    expect(find.bySemanticsLabel('Icône actuelle : 🛒'), findsOneWidget);
    await tap(tester, byKey('icon-pets'));
    expect(selectedIcon(tester), 'icon-pets');
    await tap(tester, byKey('color-FB8C00'));
    await tapSave(tester);
    await settle(tester, byKey('add-category'));

    expect(app.api.calls('PATCH $base/$groceries').single.body, {
      'name': 'Marché',
      'icon': 'pets',
      'color': '#FB8C00',
    });
    final c = await load(db, tester, groceries);
    expect(
      (c.name, c.icon, c.color, c.parentId),
      ('Marché', 'pets', '#FB8C00', food),
    );
    expect(find.text('Marché'), findsOneWidget);
    expect(find.text('Courses'), findsNothing);
  });

  testWidgets('aucun changement : retour sans requête', (tester) async {
    final (app, _) = await openCategories(tester);
    await tester.tap(byKey('category-tile-$transport'));
    await pumpIo(tester, until: byKey('category-name'));
    await tapSave(tester);
    await pumpIo(tester, until: byKey('add-category'));
    expect(app.api.requests.where((r) => r.method == 'PATCH'), isEmpty);
  });

  testWidgets('nom vide : refusé sans requête', (tester) async {
    final (app, _) = await openCategories(tester);
    await tester.tap(byKey('category-tile-$transport'));
    await pumpIo(tester, until: byKey('category-name'));
    await enter(tester, 'category-name', '   ');
    await tap(tester, byKey('save-category'));
    expect(find.text('Saisissez un nom.'), findsOneWidget);
    expect(app.api.requests.where((r) => r.method == 'PATCH'), isEmpty);
  });

  testWidgets('emoji hors catalogue gardé tel quel si l’icône n’est pas '
      'changée ; revenir à l’emoji après un autre choix', (tester) async {
    final (app, db) = await openCategories(tester);
    servePatch(app, db, tester, groceries);
    await tester.tap(byKey('category-tile-$groceries'));
    await pumpIo(tester, until: byKey('category-name'));
    await tap(tester, byKey('icon-cart'));
    await tap(tester, byKey('icon-custom'));
    await enter(tester, 'category-name', 'Marché');
    await tapSave(tester);
    await settle(tester, byKey('add-category'));
    expect(app.api.calls('PATCH $base/$groceries').single.body, {
      'name': 'Marché',
    });
    expect((await load(db, tester, groceries)).icon, '🛒');
  });

  testWidgets('sélecteur d’icônes : grille du catalogue, noms lus par les '
      'lecteurs d’écran, une seule sélectionnée', (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await openCategories(tester);
      await tester.tap(byKey('add-category'));
      await pumpIo(tester, until: byKey('category-name'));
      // Nouvelle catégorie : étiquette par défaut, pas d'icône « actuelle ».
      expect(selectedIcon(tester), 'icon-$defaultCategoryIcon');
      expect(byKey('icon-custom'), findsNothing);
      for (final key in categoryIconKeys) {
        expect(byKey('icon-$key'), findsOneWidget, reason: key);
      }
      expect(
        tester.getSemantics(byKey('icon-cart')),
        isSemantics(label: 'Panier', isButton: true, isSelected: false),
      );
      await tap(tester, byKey('icon-cart'));
      expect(selectedIcon(tester), 'icon-cart');
      expect(
        tester.getSemantics(byKey('icon-cart')),
        isSemantics(label: 'Panier', isSelected: true),
      );
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('créer une sous-catégorie : POST idempotent (UUID v7), '
      'rangée sous sa racine', (tester) async {
    final (app, db) = await openCategories(tester);
    app.api.on('POST $base', (r) {
      final body = r.body! as Map<String, dynamic>;
      return FakeResponse(201, {...body, 'systemKey': null, 'hidden': false});
    });

    await tester.tap(byKey('add-category'));
    await pumpIo(tester, until: byKey('category-name'));
    await enter(tester, 'category-name', 'Bio');
    await tap(tester, byKey('category-parent'));
    await tap(tester, find.text('Alimentation').last);
    await tap(tester, byKey('color-1E88E5'));
    await tapSave(tester);
    await settleUntil(tester, () => byKey('category-name').evaluate().isEmpty);
    expect(find.text('Bio'), findsOneWidget);

    final body =
        app.api.calls('POST $base').single.body! as Map<String, dynamic>;
    expect(body['id'], matches(uuidV7));
    expect(body, {
      'id': body['id'],
      'name': 'Bio',
      'icon': defaultCategoryIcon,
      'color': '#1E88E5',
      'parentId': food,
    });
    final tree = await io(tester, () => db.categoryTree(notebookId));
    final foodNode = tree.firstWhere((n) => n.category.id == food);
    expect(foodNode.children.map((c) => c.name), ['Courses', 'Bio']);
    // Proposée aussitôt à la saisie.
    final offered = await io(tester, () => db.selectableCategories(notebookId));
    expect(offered.map((c) => c.name), contains('Bio'));
  });

  testWidgets('création refusée par l’API (422) : message, formulaire gardé', (
    tester,
  ) async {
    final (app, db) = await openCategories(tester);
    app.api.on(
      'POST $base',
      (_) => FakeResponse.problem(422, 'Catégorie parente invalide'),
    );
    await tester.tap(byKey('add-category'));
    await pumpIo(tester, until: byKey('category-name'));
    await enter(tester, 'category-name', 'Bio');
    await tapSave(tester);
    await settle(tester, find.textContaining('Modification refusée'));
    expect(byKey('category-name'), findsOneWidget);
    final tree = await io(tester, () => db.categoryTree(notebookId));
    expect(tree.map((n) => n.category.name), isNot(contains('Bio')));
  });

  testWidgets('en anglais', (tester) async {
    final app = await startSignedIn(tester, locale: const Locale('en'));
    await tester.tap(byKey('open-settings'));
    await tester.pumpAndSettle();
    expect(find.text('Categories'), findsOneWidget);
    await tester.tap(byKey('open-categories'));
    await pumpIo(tester, until: byKey('category-tile-$food'));
    expect(find.text('Hidden: not offered when adding expenses'), findsWidgets);
    app.api.on(
      'PATCH $base/$transport',
      (_) => throw const SocketExceptionLike(),
    );
    await tester.tap(byKey('category-visible-$transport'));
    await settle(tester, find.textContaining('A connection is needed'));
  });

  testWidgets('formulaire ouvert : une synchro ne réinitialise pas la saisie', (
    tester,
  ) async {
    final (app, _) = await openCategories(tester);
    await tester.tap(byKey('category-tile-$transport'));
    await pumpIo(tester, until: byKey('category-name'));
    await enter(tester, 'category-name', 'Trajets');
    await tap(tester, byKey('color-E53935'));

    refreshCategories(app.container.invalidate);
    await pumpIo(tester, until: byKey('category-name'));
    expect(find.text('Trajets'), findsOneWidget);
    final check = find.descendant(
      of: byKey('color-E53935'),
      matching: find.byIcon(Icons.check_rounded),
    );
    expect(check, findsOneWidget);
  });

  testWidgets('création relancée après une réponse perdue : même identifiant', (
    tester,
  ) async {
    final (app, _) = await openCategories(tester);
    var attempts = 0;
    app.api.on('POST $base', (r) {
      if (attempts++ == 0) throw const SocketExceptionLike();
      final body = r.body! as Map<String, dynamic>;
      return FakeResponse(201, {...body, 'systemKey': null, 'hidden': false});
    });
    await tester.tap(byKey('add-category'));
    await pumpIo(tester, until: byKey('category-name'));
    await enter(tester, 'category-name', 'Bio');
    await tapSave(tester);
    await settle(tester, find.textContaining('Connexion requise'));
    await tapSave(tester);
    await settleUntil(tester, () => byKey('category-name').evaluate().isEmpty);

    final ids = app.api
        .calls('POST $base')
        .map((r) => (r.body! as Map<String, dynamic>)['id'])
        .toList();
    expect(ids, hasLength(2));
    expect(ids.first, ids.last);
  });

  testWidgets('autre session pendant la requête : rien n’est écrit', (
    tester,
  ) async {
    final (app, db) = await openCategories(tester);
    app.api.on('PATCH $base/$transport', (r) async {
      await app.store.write(AccountEpoch.key, 'autre-session');
      final c = (await db.categoryById(transport))!;
      return FakeResponse(200, echo(c, r.body! as Map<String, dynamic>));
    });
    await tester.tap(byKey('category-visible-$transport'));
    await settle(tester, find.textContaining('Connexion requise'));
    expect((await load(db, tester, transport)).hidden, isFalse);
  });

  testWidgets('catégorie supprimée ailleurs : 404 signalé, écran introuvable', (
    tester,
  ) async {
    final (app, db) = await openCategories(tester);
    app.api.on(
      'PATCH $base/$transport',
      (_) => FakeResponse.problem(404, 'Not Found'),
    );
    await tester.tap(byKey('category-visible-$transport'));
    await settle(tester, find.text('Cette catégorie n\'existe plus.'));
    expect((await load(db, tester, transport)).hidden, isFalse);

    app.router.push(
      '/settings/categories/0190a000-0000-7000-8000-0000000000ff',
    );
    await pumpIo(tester, until: byKey('category-gone'));
  });
}

/// Panne réseau simulée (le gestionnaire du faux serveur lève).
class SocketExceptionLike implements Exception {
  const SocketExceptionLike();
}
