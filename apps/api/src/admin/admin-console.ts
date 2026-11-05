// Fichiers du build `apps/admin` (§8.5, ADR-044), chargés en mémoire au démarrage. Deux zones
// étanches : `login/` (page de connexion publique, sans code d'administration) et `app/`
// (application React-admin, servie à une session admin seulement). Seuls les noms présents dans le
// build sont servables : aucun chemin de la requête n'atteint le système de fichiers.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ConfigError } from '../config/env.js';

export const ADMIN_CONSOLE = Symbol('ADMIN_CONSOLE');

export type ConsoleZone = 'login' | 'app';

export interface ConsoleFile {
  body: Buffer;
  contentType: string;
}

export interface AdminConsole {
  /** `index.html` de la zone. */
  page(zone: ConsoleZone): ConsoleFile;
  /** Fichier `assets/<name>` de la zone, s'il fait partie du build. */
  asset(zone: ConsoleZone, name: string): ConsoleFile | undefined;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Politique de contenu des pages du back-office : tout depuis l'origine, aucun cadre (anti
 * clickjacking). `style-src 'unsafe-inline'` : MUI (emotion) injecte ses styles à l'exécution.
 */
export const CONSOLE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function invalid(reason: string): ConfigError {
  return new ConfigError(`Configuration invalide, démarrage refusé — ADMIN_DIST_DIR : ${reason}`);
}

function loadZone(dir: string, zone: ConsoleZone) {
  const root = join(dir, zone);
  let page: ConsoleFile;
  try {
    page = {
      body: readFileSync(join(root, 'index.html')),
      contentType: 'text/html; charset=utf-8',
    };
  } catch {
    throw invalid(`${zone}/index.html introuvable (lancer \`pnpm --filter admin build\`)`);
  }
  const assets = new Map<string, ConsoleFile>();
  const assetsDir = join(root, 'assets');
  const names = statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()
    ? readdirSync(assetsDir)
    : [];
  for (const name of names) {
    const contentType = CONTENT_TYPES[extname(name)];
    const path = join(assetsDir, name);
    if (!contentType || !statSync(path).isFile()) continue;
    assets.set(name, { body: readFileSync(path), contentType });
  }
  return { page, assets };
}

export function loadAdminConsole(dir: string): AdminConsole {
  const zones = { login: loadZone(dir, 'login'), app: loadZone(dir, 'app') };
  return {
    page: (zone) => zones[zone].page,
    asset: (zone, name) => zones[zone].assets.get(name),
  };
}
