// Seuil de couverture des lignes d'un rapport lcov (NF-QUA-01, ADR-061), utilisé pour le mobile :
// `node scripts/lcov-threshold.mjs mobile 70` (lit mobile/coverage/lcov.info après `flutter test --coverage`).
// Exclut le code généré (`*.g.dart`, `*.freezed.dart`) et les traductions générées (`lib/l10n/`).
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXCLUDED = [/\.g\.dart$/, /\.freezed\.dart$/, /(^|\/)lib\/l10n\//];

/** @returns {{ file: string, found: number, hit: number }[]} */
export function parseLcov(text) {
  const files = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3), lines: new Map() };
    } else if (line.startsWith('DA:') && current) {
      const [n, hits] = line.slice(3).split(',');
      current.lines.set(n, (current.lines.get(n) ?? 0) + Number(hits));
    } else if (line === 'end_of_record' && current) {
      const counts = [...current.lines.values()];
      files.push({
        file: current.file,
        found: counts.length,
        hit: counts.filter((h) => h > 0).length,
      });
      current = null;
    }
  }
  return files;
}

// Fichiers qu'aucun test ne charge, donc absents de lcov : point d'entrée (`main()`), `typedef` seul.
const MOBILE_ALLOW_ABSENT = ['lib/main.dart', 'lib/core/clock.dart'];

const excluded = (file) => EXCLUDED.some((re) => re.test(file));

/**
 * `sources` : fichiers du projet ; ceux qu'aucun test ne charge sont absents du rapport lcov
 * (couverture surestimée) et font échouer le contrôle, sauf `allowAbsent`.
 * @returns {{ ok: boolean, found: number, hit: number, percent: number, absent: string[] }}
 */
export function checkLcov(text, { min, sources = [], allowAbsent = [] }) {
  const kept = parseLcov(text).filter((f) => !excluded(f.file));
  const found = kept.reduce((s, f) => s + f.found, 0);
  const hit = kept.reduce((s, f) => s + f.hit, 0);
  const percent = found === 0 ? 0 : (hit / found) * 100;
  const reported = new Set(kept.map((f) => f.file));
  const absent = sources.filter(
    (f) => !excluded(f) && !reported.has(f) && !allowAbsent.includes(f),
  );
  return { ok: found > 0 && percent >= min && absent.length === 0, found, hit, percent, absent };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [project, min = '70'] = process.argv.slice(2);
  if (!project) {
    process.stderr.write('usage : node scripts/lcov-threshold.mjs <projet Flutter> [seuil %]\n');
    process.exit(2);
  }
  const sources = readdirSync(join(project, 'lib'), { recursive: true })
    .map((f) => `lib/${String(f).split(sep).join('/')}`)
    .filter((f) => f.endsWith('.dart'))
    .sort();
  const r = checkLcov(readFileSync(join(project, 'coverage', 'lcov.info'), 'utf8'), {
    min: Number(min),
    sources,
    allowAbsent: MOBILE_ALLOW_ABSENT,
  });
  process.stdout.write(
    `Couverture des lignes : ${r.percent.toFixed(2)} % (${r.hit}/${r.found}), seuil ${min} %\n`,
  );
  for (const f of r.absent)
    process.stdout.write(`Absent du rapport (aucun test ne le charge) : ${f}\n`);
  process.exit(r.ok ? 0 : 1);
}
