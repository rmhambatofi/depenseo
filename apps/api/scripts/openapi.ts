// Régénère apps/api/openapi.json sans écouter de port ni lire de secret réel.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { buildOpenApiDocument, serializeOpenApi } from '../src/openapi.js';

const config = loadConfig({
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  // Aucune connexion n'est ouverte : le pool ne se connecte qu'à la première requête.
  DATABASE_URL: 'mysql://openapi:unused@127.0.0.1:1/openapi',
});
const app = await createApp(config);
await app.init();
const target = new URL('../../openapi.json', import.meta.url);
writeFileSync(target, serializeOpenApi(buildOpenApiDocument(app)));
await app.close();
process.stdout.write(`OpenAPI écrit : ${target.pathname}\n`);
