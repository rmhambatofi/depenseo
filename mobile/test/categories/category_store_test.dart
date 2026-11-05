// Lecture et reprise locales des catégories (P6-07, ADR-052).
import 'package:depenseo/core/db/app_database.dart';
import 'package:depenseo/core/db/category_store.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

const nb = '0190a000-0000-7000-8000-00000000000b';
const otherNb = '0190a000-0000-7000-8000-00000000000c';
const food = '0190a000-0000-7000-8000-0000000000f0';
const groceries = '0190a000-0000-7000-8000-0000000000f1';
const transport = '0190a000-0000-7000-8000-0000000000a0';
const created = '0190a000-0000-7000-8000-0000000000e0';

CategoriesCompanion row(
  String id,
  String name, {
  String notebookId = nb,
  String? parentId,
  int position = 0,
  bool hidden = false,
  String? deletedAt,
}) => CategoriesCompanion.insert(
  id: id,
  notebookId: notebookId,
  parentId: Value(parentId),
  systemKey: const Value('food'),
  name: name,
  icon: '🛒',
  color: '#43A047',
  position: Value(position),
  hidden: Value(hidden),
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: Value(deletedAt),
);

Map<String, dynamic> dto(
  String id,
  String name, {
  String? parentId,
  bool hidden = false,
}) => {
  'id': id,
  'parentId': parentId,
  'systemKey': null,
  'name': name,
  'icon': '🎮',
  'color': '#1E88E5',
  'hidden': hidden,
};

void main() {
  late AppDatabase db;
  final now = DateTime.utc(2026, 11, 5, 9, 30);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await db.batch(
      (b) => b.insertAll(db.categories, [
        row(transport, 'Transport', position: 2),
        row(food, 'Alimentation', position: 1),
        row(groceries, 'Courses', parentId: food, position: 1, hidden: true),
        row(
          '0190a000-0000-7000-8000-0000000000d0',
          'Supprimée',
          position: 3,
          deletedAt: '2026-11-02T00:00:00.000Z',
        ),
        row(
          '0190a000-0000-7000-8000-0000000000c9',
          'Orpheline',
          parentId: '0190a000-0000-7000-8000-0000000000ff',
        ),
        row(
          '0190a000-0000-7000-8000-0000000000b9',
          'Autre',
          notebookId: otherNb,
        ),
      ]),
    );
  });
  tearDown(() => db.close());

  test('arbre : racines dans l’ordre, masquées gardées, supprimées et '
      'orphelines exclues, carnet seul', () async {
    final tree = await db.categoryTree(nb);
    expect(tree.map((n) => n.category.name), ['Alimentation', 'Transport']);
    expect(tree.first.children.map((c) => c.name), ['Courses']);
    expect(tree.first.children.single.hidden, isTrue);
    expect(tree.last.children, isEmpty);
  });

  test('reprise d’une modification : place et horodatage gardés', () async {
    await db.storeCategoryFromApi(
      nb,
      dto(groceries, 'Marché', parentId: food),
      now,
    );
    final c = (await db.categoryById(groceries))!;
    expect(c.name, 'Marché');
    expect(c.icon, '🎮');
    expect(c.color, '#1E88E5');
    expect(c.hidden, isFalse);
    expect(c.systemKey, isNull);
    expect(c.position, 1);
    // La synchro apportera l'horodatage serveur.
    expect(c.updatedAt, '2026-11-01T00:00:00.000Z');
  });

  test(
    'reprise d’une création : rangée en dernier, datée maintenant',
    () async {
      await db.storeCategoryFromApi(nb, dto(created, 'Loisirs'), now);
      final c = (await db.categoryById(created))!;
      expect(c.notebookId, nb);
      expect(c.position, 4);
      expect(c.updatedAt, '2026-11-05T09:30:00.000Z');
      expect(c.deletedAt, isNull);
      final tree = await db.categoryTree(nb);
      expect(tree.last.category.id, created);
    },
  );

  test('même identifiant dans un autre carnet : ligne intacte', () async {
    const foreign = '0190a000-0000-7000-8000-0000000000b9';
    await db.storeCategoryFromApi(nb, dto(foreign, 'Piratée'), now);
    final c = (await db.categoryById(foreign))!;
    expect((c.notebookId, c.name), (otherNb, 'Autre'));
  });

  test('création dans un carnet vide : position 1', () async {
    await db.storeCategoryFromApi(
      '0190a000-0000-7000-8000-00000000000d',
      dto(created, 'Loisirs'),
      now,
    );
    expect((await db.categoryById(created))!.position, 1);
  });
}
