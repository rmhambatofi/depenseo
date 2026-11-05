import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const E2E_PORT = 3100;
/** Comptes créés par le serveur e2e (`apps/api/test/e2e/admin-e2e-server.ts`). */
export const ACCOUNTS_FILE = join(tmpdir(), `depenseo-admin-e2e-${E2E_PORT}.json`);
