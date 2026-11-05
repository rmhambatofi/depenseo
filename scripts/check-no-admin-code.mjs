// `node scripts/check-no-admin-code.mjs` (CI, après `pnpm --filter @depenseo/admin build`) :
// échoue si du code d'administration apparaît dans `mobile/` ou dans un bundle public (F-ADM-02).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_MARKERS,
  findAdminCode,
  MOBILE_MARKERS,
  REQUIRED_IN_ADMIN_APP,
} from './admin-code.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = (path) => join(root, path);

const loginBundle = at('apps/admin/dist/login');
const appBundle = at('apps/admin/dist/app');
if (!existsSync(loginBundle) || !existsSync(appBundle)) {
  process.stderr.write('Build admin absent : lancer `pnpm --filter @depenseo/admin build`\n');
  process.exit(1);
}
// Contre-épreuve : chaque marqueur clé doit reconnaître le vrai bundle admin, sinon il est périmé.
for (const marker of REQUIRED_IN_ADMIN_APP) {
  if (findAdminCode(appBundle, [marker], root).length === 0) {
    process.stderr.write(`Marqueur périmé : ${marker} absent de apps/admin/dist/app\n`);
    process.exit(1);
  }
}

const hits = [
  ...findAdminCode(at('mobile'), MOBILE_MARKERS, root),
  ...findAdminCode(loginBundle, ADMIN_MARKERS, root),
  ...findAdminCode(at('apps/web/dist'), ADMIN_MARKERS, root),
  ...findAdminCode(at('packages/api-client'), ADMIN_MARKERS, root),
  ...findAdminCode(at('apps/api/openapi.json'), ADMIN_MARKERS, root),
];
if (hits.length > 0) {
  for (const { file, marker } of hits) process.stderr.write(`Code admin : ${file} (${marker})\n`);
  process.exit(1);
}
process.stdout.write('Aucun code admin dans mobile/ ni dans les bundles publics\n');
