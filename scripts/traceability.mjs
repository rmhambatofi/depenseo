// Vérifie docs/dev/TRACEABILITY.md (§11.1, P7-01) : chaque ligne des tableaux est remplie,
// cite au moins un fichier de test, et chaque chemin cité (entre backticks, contenant `/`)
// existe, sauf s'il est suivi de « (Pn-nn… » où Pn-nn est une tâche encore ouverte de PLAN.md.
// CLI : `node scripts/traceability.mjs` (code 1 et liste des problèmes en cas d'écart).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Raccourcis du document (voir son en-tête « Conventions »).
const PREFIXES = [
  ['api/', 'apps/api/'],
  ['shared/', 'packages/shared/'],
];
const TEST_FILE = /(\.spec\.ts|\.test\.tsx?|\.test\.mjs|\.bench\.ts|_test\.dart)$/;
const TASK = /\bP\d+-\d+\b/g;

/** Tâches `[ ]`, `[~]` ou `[!]` de PLAN.md. */
export function openTasks(plan) {
  const open = new Set();
  for (const m of plan.matchAll(/^- \[([ ~!])\] (P\d+-\d+)\b/gm)) open.add(m[2]);
  return open;
}

function allTasks(plan) {
  return new Set([...plan.matchAll(/^- \[[ ~!x]\] (P\d+-\d+)\b/gm)].map((m) => m[1]));
}

function expandBraces(path) {
  const m = path.match(/^(.*?)\{([^}]*)\}(.*)$/);
  if (!m) return [path];
  return m[2].split(',').flatMap((alt) => expandBraces(m[1] + alt + m[3]));
}

function resolve(path) {
  for (const [short, full] of PREFIXES)
    if (path.startsWith(short)) return full + path.slice(short.length);
  return path;
}

function tableRows(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c)) || cells[0] === 'Exigence' || cells[0] === 'Exigence M')
      continue;
    rows.push(cells);
  }
  return rows;
}

/**
 * @param {string} markdown contenu de TRACEABILITY.md
 * @param {{ exists: (path: string) => boolean, plan: string }} deps
 * @returns {string[]} problèmes (vide si conforme)
 */
export function checkTraceability(markdown, { exists, plan }) {
  const open = openTasks(plan);
  const known = allTasks(plan);
  const rows = tableRows(markdown);
  if (rows.length === 0) return ['aucune ligne de tableau trouvée'];
  const problems = [];
  for (const cells of rows) {
    const id = cells[0] || '(exigence vide)';
    if (cells.length !== 3) {
      problems.push(`${id} : ligne à ${cells.length} cellule(s), 3 colonnes attendues`);
      continue;
    }
    if (cells.some((c) => c === '')) {
      problems.push(`${id} : cellule vide`);
      continue;
    }
    const tasks = cells[1].match(TASK) ?? [];
    for (const t of tasks)
      if (!known.has(t)) problems.push(`${id} : tâche ${t} absente de PLAN.md`);
    const hasOpenTask = tasks.some((t) => open.has(t));
    let testPaths = 0;
    for (const m of cells[2].matchAll(/`([^`]+)`(\s*\((P\d+-\d+)\b)?/g)) {
      const [, token, , pending] = m;
      if (/\s/.test(token) || token.startsWith('/')) continue;
      if (!token.includes('/')) {
        if (TEST_FILE.test(token) && !token.startsWith('*')) {
          problems.push(`${id} : \`${token}\` sans répertoire, citer le chemin complet`);
        }
        continue;
      }
      if (token.includes('*')) {
        problems.push(`${id} : \`${token}\` est un motif, citer les fichiers`);
        continue;
      }
      if (pending && !open.has(pending)) {
        problems.push(
          `${id} : \`${token}\` marqué (${pending}) mais ${pending} n'est plus ouverte`,
        );
      }
      for (const path of expandBraces(token).map(resolve)) {
        if (TEST_FILE.test(path)) testPaths++;
        // Un fichier à venir n'est toléré que s'il est suivi de « (Pn-nn… » avec Pn-nn ouverte.
        if (!exists(path) && !(pending && open.has(pending))) {
          problems.push(`${id} : ${path} introuvable`);
        }
      }
    }
    if (testPaths === 0 && !hasOpenTask) problems.push(`${id} : aucun chemin de test cité`);
  }
  return problems;
}

/** Vérifie le document du dépôt. */
export function readRepo() {
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  return checkTraceability(read('docs/dev/TRACEABILITY.md'), {
    exists: (p) => existsSync(join(ROOT, p)),
    plan: read('docs/dev/PLAN.md'),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = readRepo();
  for (const p of problems) process.stderr.write(`${p}\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}
