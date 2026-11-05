// Vérificateur de docs/dev/TRACEABILITY.md (§11.1, P7-01) : `node --test scripts/traceability.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTraceability, openTasks, readRepo } from './traceability.mjs';

const PLAN = `
- [x] P1-01 Fait.
- [ ] P7-03 À faire.
- [~] P7-04 En cours.
`;

const table = (...rows) =>
  ['| Exigence | Tâche(s) PLAN | Test(s) prévus |', '| --- | --- | --- |', ...rows].join('\n');

const files = new Set([
  'apps/api/test/a.spec.ts',
  'apps/api/test/b.spec.ts',
  'packages/shared/src/money.test.ts',
  'mobile/test/lock/app_lock_test.dart',
  'scripts/db.test.mjs',
]);
const check = (markdown) =>
  checkTraceability(markdown, { exists: (p) => files.has(p), plan: PLAN });

test('openTasks : tâches non terminées seulement', () => {
  assert.deepEqual([...openTasks(PLAN)].sort(), ['P7-03', 'P7-04']);
});

test('tableau conforme : préfixes api/ et shared/ résolus, aucun problème', () => {
  const md = table(
    '| F-A | P1-01 | `api/test/a.spec.ts` (cas), `shared/src/money.test.ts` |',
    '| F-B | P1-01 | `mobile/test/lock/app_lock_test.dart`, `scripts/db.test.mjs`, `parseAmountInput` |',
  );
  assert.deepEqual(check(md), []);
});

test('accolades développées', () => {
  assert.deepEqual(check(table('| F-A | P1-01 | `api/test/{a,b}.spec.ts` |')), []);
  assert.match(
    check(table('| F-A | P1-01 | `api/test/{a,c}.spec.ts` |'))[0],
    /c\.spec\.ts.*introuvable/,
  );
});

test('chemin introuvable : erreur si toutes les tâches de la ligne sont faites', () => {
  const problems = check(table('| F-A | P1-01 | `api/test/absent.spec.ts` |'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /F-A.*apps\/api\/test\/absent\.spec\.ts.*introuvable/);
});

test("chemin à venir toléré seulement s'il est marqué par une tâche ouverte", () => {
  assert.deepEqual(
    check(
      table('| F-A | P1-01, P7-03 | `api/test/futur.spec.ts` (P7-03, 429), `api/test/a.spec.ts` |'),
    ),
    [],
  );
  // Sans marque, la tâche ouverte de la ligne ne couvre pas un chemin disparu.
  assert.match(
    check(table('| F-A | P1-01, P7-03 | `api/test/a.spec.ts`, `api/test/renomme.spec.ts` |'))[0],
    /renomme\.spec\.ts introuvable/,
  );
  // Marque d'une tâche terminée : à retirer.
  assert.match(
    check(table('| F-A | P1-01 | `api/test/a.spec.ts` (P1-01) |'))[0],
    /marqué \(P1-01\).*plus ouverte/,
  );
});

test('tout jeton avec « / » est vérifié, quelle que soit son extension', () => {
  assert.match(
    check(table('| F-A | P1-01 | `api/test/a.spec.ts`, `mobile/tool/absent.sh` |'))[0],
    /mobile\/tool\/absent\.sh introuvable/,
  );
  assert.deepEqual(check(table('| F-A | P1-01 | `api/test/a.spec.ts`, `/admin` |')), []);
});

test('cellule vide ou ligne incomplète refusée', () => {
  assert.match(check(table('| F-A | P1-01 |  |'))[0], /F-A.*cellule vide/);
  assert.match(check(table('| F-A |  | `api/test/a.spec.ts` |'))[0], /F-A.*cellule vide/);
  assert.match(check(table('| F-A | P1-01 |'))[0], /3 colonnes/);
});

test('ligne sans aucun chemin refusée sauf tâche ouverte', () => {
  assert.match(check(table('| F-A | P1-01 | seuil vérifié en CI |'))[0], /aucun chemin/);
  assert.match(
    check(table('| F-A | P1-01 | `scripts/db.test.mjs`, `docs/x.md` |'))[0],
    /introuvable/,
  );
  files.add('docs/x.md');
  assert.match(check(table('| F-A | P1-01 | `docs/x.md` |'))[0], /aucun chemin de test/);
  files.delete('docs/x.md');
  assert.deepEqual(check(table('| F-A | P7-03 | seuil vérifié en CI |')), []);
});

test('nom de fichier sans répertoire refusé', () => {
  assert.match(
    check(table('| F-A | P1-01 | `api/test/a.spec.ts`, `b.spec.ts` |'))[0],
    /b\.spec\.ts.*chemin complet/,
  );
  assert.match(
    check(table('| F-A | P1-01 | `api/test/a.spec.ts`, `x_test.dart` |'))[0],
    /chemin complet/,
  );
});

test('motif glob refusé dans un chemin', () => {
  assert.match(check(table('| F-A | P1-01 | `apps/admin/src/*.test.ts` |'))[0], /motif/);
});

test('tâche citée absente du plan refusée', () => {
  assert.match(check(table('| F-A | P9-99 | `api/test/a.spec.ts` |'))[0], /P9-99.*absente/);
});

test('aucun tableau : erreur', () => {
  assert.match(check('# vide')[0], /aucune ligne/);
});

test('docs/dev/TRACEABILITY.md du dépôt : chaque chemin cité existe', () => {
  assert.deepEqual(readRepo(), []);
});
