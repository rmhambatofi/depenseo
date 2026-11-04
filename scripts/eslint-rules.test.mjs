// Vérifie que la configuration ESLint du dépôt interdit new Date('AAAA-MM-JJ') (NF-FMT-08, ADR-002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./lint-fixtures/${name}`, import.meta.url));

async function lint(file) {
  const eslint = new ESLint({ cwd: root, ignore: false });
  const [result] = await eslint.lintFiles([file]);
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}

test('new Date et Date.parse sur une date calendaire (AAAA, AAAA-MM, AAAA-MM-JJ, gabarit) sont rejetés', async () => {
  const messages = await lint(fixture('calendar-date-violation.ts'));
  assert.equal(messages.length, 7, JSON.stringify(messages));
  assert.ok(messages.every((m) => m.severity === 2));
});

test('un horodatage complet et new Date() restent autorisés', async () => {
  const messages = await lint(fixture('calendar-date-ok.ts'));
  assert.deepEqual(messages, []);
});
