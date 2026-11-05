// Seuil de couverture mobile (NF-QUA-01, P7-02) : `node --test scripts/lcov-threshold.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLcov, parseLcov } from './lcov-threshold.mjs';

const record = (file, hits) =>
  [
    `SF:${file}`,
    ...hits.map((h, i) => `DA:${i + 1},${h}`),
    `LF:${hits.length}`,
    'end_of_record',
  ].join('\n');

const LCOV = [
  record('lib/core/a.dart', [1, 1, 1, 0]), // 3/4
  record('lib/features/b.dart', [1, 0]), // 1/2
  record('lib/core/db/app_database.g.dart', [0, 0, 0, 0, 0, 0]),
  record('lib/l10n/app_localizations.dart', [0, 0]),
].join('\n');

test('parseLcov : lignes trouvées et couvertes par fichier', () => {
  assert.deepEqual(parseLcov(LCOV)[0], { file: 'lib/core/a.dart', found: 4, hit: 3 });
  assert.equal(parseLcov(LCOV).length, 4);
});

test('code généré et l10n exclus du calcul', () => {
  const r = checkLcov(LCOV, { min: 60 });
  assert.equal(r.found, 6);
  assert.equal(r.hit, 4);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.percent - 66.67) < 0.01);
});

test('sous le seuil : échec', () => {
  assert.equal(checkLcov(LCOV, { min: 70 }).ok, false);
});

test('DA répétées (plusieurs exécutions) : une ligne comptée une fois, couverte si un passage', () => {
  const lcov = ['SF:lib/x.dart', 'DA:1,0', 'DA:1,2', 'DA:2,0', 'end_of_record'].join('\n');
  assert.deepEqual(parseLcov(lcov)[0], { file: 'lib/x.dart', found: 2, hit: 1 });
});

test('rapport vide : échec explicite', () => {
  const r = checkLcov('', { min: 70 });
  assert.equal(r.ok, false);
  assert.equal(r.found, 0);
});

test('fichier source absent du rapport (jamais chargé par un test) : échec sauf liste blanche', () => {
  const sources = ['lib/core/a.dart', 'lib/features/b.dart', 'lib/orphan.dart', 'lib/main.dart'];
  const r = checkLcov(LCOV, { min: 60, sources, allowAbsent: ['lib/main.dart'] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.absent, ['lib/orphan.dart']);
  const ok = checkLcov(LCOV, { min: 60, sources: sources.slice(0, 2), allowAbsent: [] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.absent, []);
});

test('sources : fichiers générés ignorés', () => {
  const r = checkLcov(LCOV, {
    min: 60,
    sources: ['lib/core/a.dart', 'lib/features/b.dart', 'lib/x.g.dart', 'lib/l10n/app_fr.dart'],
  });
  assert.deepEqual(r.absent, []);
});
