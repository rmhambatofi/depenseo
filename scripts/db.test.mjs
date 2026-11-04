// Vérifie la base MariaDB locale/CI de docker-compose.yml (NF-QUA-03, §8.2, ADR-010).
// Prérequis : `docker compose up -d db && scripts/db-wait.sh`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = (name, fallback) => process.env[name] ?? fallback;
const API_PW = env('DB_API_PASSWORD', 'depenseo_api_dev');
const ADMIN_PW = env('DB_ADMIN_PASSWORD', 'depenseo_admin_dev');
const MIGRATOR_PW = env('DB_MIGRATOR_PASSWORD', 'depenseo_migrator_dev');

/** Exécute une requête dans le conteneur `db` et renvoie les lignes (colonnes séparées par \t). */
function query(
  sql,
  { user = 'root', password = env('DB_ROOT_PASSWORD', 'depenseo_root_dev'), database = '' } = {},
) {
  const args = ['compose', 'exec', '-T', 'db', 'mariadb', '-N', '-B', `-u${user}`, `-p${password}`];
  if (database) args.push(database);
  args.push('-e', sql);
  const out = execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out
    .trim()
    .split('\n')
    .map((line) => line.split('\t'));
}

test('scripts/db-wait.sh rend la main quand la base est prête', () => {
  execFileSync('scripts/db-wait.sh', {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, DB_WAIT_TIMEOUT: '90' },
  });
});

test('SELECT VERSION() renvoie MariaDB 10.6.x', () => {
  const [[version]] = query('SELECT VERSION()');
  assert.match(version, /^10\.6\.\d+-MariaDB/);
});

test('jeu de caractères et collation serveur : utf8mb4 / utf8mb4_unicode_520_ci', () => {
  const [[charset, collation]] = query('SELECT @@character_set_server, @@collation_server');
  assert.equal(charset, 'utf8mb4');
  assert.equal(collation, 'utf8mb4_unicode_520_ci');
});

test('les bases depenseo et depenseo_test existent en utf8mb4_unicode_520_ci', () => {
  const rows = query(
    "SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'depenseo%' ORDER BY SCHEMA_NAME",
  );
  assert.deepEqual(rows, [
    ['depenseo', 'utf8mb4', 'utf8mb4_unicode_520_ci'],
    ['depenseo_test', 'utf8mb4', 'utf8mb4_unicode_520_ci'],
  ]);
});

test('serveur non UTC et REPEATABLE READ, comme un mutualisé : l’API devra les forcer (P1-02)', () => {
  const [[tz, offset, isolation]] = query(
    'SELECT @@global.time_zone, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()), @@global.tx_isolation',
  );
  assert.equal(tz, 'SYSTEM');
  assert.ok(['60', '120'].includes(offset), `décalage Europe/Paris attendu, reçu ${offset} min`);
  assert.equal(isolation, 'REPEATABLE-READ');
});

test('sql_mode strict', () => {
  const [[sqlMode]] = query('SELECT @@global.sql_mode');
  assert.ok(sqlMode.split(',').includes('STRICT_ALL_TABLES'), sqlMode);
});

test("trois comptes distincts : l'API et le back-office n'ont aucun droit sur le schéma, les migrations si", () => {
  const ddl = 'CREATE TABLE p0_02_probe (id INT) ; DROP TABLE p0_02_probe';
  for (const [user, password] of [
    ['depenseo_api', API_PW],
    ['depenseo_admin', ADMIN_PW],
  ]) {
    for (const database of ['depenseo', 'depenseo_test']) {
      assert.throws(
        () => query(ddl, { user, password, database }),
        /CREATE command denied/,
        `${user}@${database}`,
      );
      assert.deepEqual(query('SELECT 1', { user, password, database }), [['1']]);
    }
    assert.throws(
      () => query('SELECT 1', { user, password, database: 'mysql' }),
      /Access denied/,
      `${user}@mysql`,
    );
  }
  for (const database of ['depenseo', 'depenseo_test']) {
    query(ddl, { user: 'depenseo_migrator', password: MIGRATOR_PW, database });
  }
});
