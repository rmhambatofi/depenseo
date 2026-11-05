// Génère src/schema.ts depuis apps/api/openapi.json (openapi-typescript).
// Appelé par `pnpm --filter api openapi` ; src/schema.test.ts vérifie que le fichier committé est à jour.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const SOURCE = new URL('../../../apps/api/openapi.json', import.meta.url);
const TARGET = new URL('../src/schema.ts', import.meta.url);

const HEADER = `/**
 * Fichier généré par packages/api-client/scripts/generate.mjs depuis apps/api/openapi.json.
 * Ne pas modifier : lancer \`pnpm --filter api openapi\`.
 */

`;

export async function generateSchema() {
  const document = JSON.parse(readFileSync(SOURCE, 'utf8'));
  const ast = await openapiTS(document, { alphabetize: true, exportType: true });
  return HEADER + astToString(ast);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TARGET, await generateSchema());
}
