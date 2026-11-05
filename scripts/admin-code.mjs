// Détection de code d'administration hors du back-office (F-ADM-02, ADR-044) : l'application
// mobile et les bundles publics (page de connexion admin, web V2, client d'API généré, contrat
// OpenAPI public) ne doivent contenir ni React-admin ni appel aux routes `/admin/api/*` autres que
// la connexion. `mobile/` ne doit même pas mentionner `/admin`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Marqueurs de code admin, recherchés dans tout fichier public. */
export const ADMIN_MARKERS = [
  // Sentinelle de l'application admin (`ADMIN_CLIENT_ID`, apps/admin/src/app/admin-api.ts).
  /depenseo-admin-app/,
  /react-admin/,
  /\bra-(?:core|ui-materialui|i18n-polyglot|language-french)\b/,
  // La page de connexion publique appelle `/admin/api/session`, et rien d'autre.
  // Contrat OpenAPI et client généré : aucune route admin hors connexion.
  /\/admin\/api\/(?!session\b)/,
];

/** Marqueurs qui doivent **chacun** reconnaître le vrai bundle admin (sinon : périmés). */
export const REQUIRED_IN_ADMIN_APP = [/depenseo-admin-app/, /react-admin/];

/** Marqueurs supplémentaires pour l'application mobile : aucune référence au back-office. */
export const MOBILE_MARKERS = [...ADMIN_MARKERS, /\/admin\b/, /depenseo_admin/, /admin_totp/];

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.dart_tool',
  'build',
  'Pods',
  '.gradle',
  '.git',
  '.symlinks',
]);
const TEXT_FILE =
  /\.(?:m?js|cjs|ts|tsx|json|html|css|map|dart|arb|yaml|yml|kt|swift|java|xml|plist|gradle|txt)$/;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* files(path);
    } else if (entry.isFile() && TEXT_FILE.test(entry.name)) {
      yield path;
    }
  }
}

/**
 * Fichiers de `root` contenant un marqueur : `[{ file, marker }]` (chemins relatifs à `base`).
 * `root` peut être un fichier ou un dossier ; absent = rien à vérifier.
 */
export function findAdminCode(root, markers, base = root) {
  const stat = statSync(root, { throwIfNoEntry: false });
  if (!stat) return [];
  const paths = stat.isDirectory() ? [...files(root)] : [root];
  const hits = [];
  for (const file of paths) {
    const text = readFileSync(file, 'utf8');
    const marker = markers.find((pattern) => pattern.test(text));
    if (marker) hits.push({ file: relative(base, file), marker: String(marker) });
  }
  return hits;
}
