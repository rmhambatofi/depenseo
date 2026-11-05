// Détecteur de code admin (F-ADM-02, ADR-044) : `node --test scripts/admin-code.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADMIN_MARKERS, findAdminCode, MOBILE_MARKERS } from './admin-code.mjs';

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'admin-code-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

test('bundle public : la connexion à /admin/api/session est permise', () => {
  const dir = tree({ 'assets/login.js': 'fetch("/admin/api/session",{method:"POST"})' });
  assert.deepEqual(findAdminCode(dir, ADMIN_MARKERS), []);
});

test('bundle public : React-admin ou une route admin autre que la session est détecté', () => {
  const dir = tree({
    'assets/a.js': 'import{Admin}from"react-admin"',
    'assets/b.js': 'fetch("/admin/api/users?limit=50")',
    'assets/c.js': 'var x="ra-core"',
    'assets/d.js': 'fetch("/admin/api/sessions")',
    'assets/e.js': 'headers:{"X-Depenseo-Client":"depenseo-admin-app"}',
    'assets/ok.js': 'console.log("rien")',
  });
  const hits = findAdminCode(dir, ADMIN_MARKERS)
    .map((h) => h.file)
    .sort();
  assert.deepEqual(hits, [
    'assets/a.js',
    'assets/b.js',
    'assets/c.js',
    'assets/d.js',
    'assets/e.js',
  ]);
});

test('mobile : toute mention de /admin est refusée, dossiers de build ignorés', () => {
  const dir = tree({
    'lib/api.dart': "const base = '/api/v1';",
    'lib/admin.dart': "final url = '/admin/login';",
    'lib/cookie.dart': "const c = 'depenseo_admin';",
    'build/app.js': "fetch('/admin/api/users')",
    '.dart_tool/x.json': '"/admin"',
    'assets/logo.png': '/admin/api/users',
  });
  const hits = findAdminCode(dir, MOBILE_MARKERS)
    .map((h) => h.file)
    .sort();
  assert.deepEqual(hits, ['lib/admin.dart', 'lib/cookie.dart']);
});

test('chemin absent : rien à signaler ; fichier unique : vérifié', () => {
  assert.deepEqual(findAdminCode(join(tmpdir(), 'nexiste-pas-admin-code'), ADMIN_MARKERS), []);
  const dir = tree({ 'openapi.json': '{"paths":{"/admin/api/stats":{}}}' });
  assert.equal(findAdminCode(join(dir, 'openapi.json'), ADMIN_MARKERS, dir).length, 1);
});
