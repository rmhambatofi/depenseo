// Banc de charge des routes clés (NF-PERF-02, P7-06, ADR-065) : 95 % des appels en moins de
// 300 ms sur un carnet de 10 000 dépenses. Lancé par `pnpm --filter api bench` (CI, après
// `pnpm test` : même base `depenseo_test`, jamais en parallèle de Vitest).
//
// Le p95 est calculé exactement à partir de la durée de chaque réponse (événement `response`
// d'autocannon), pas lu dans ses centiles (p90/p97,5 seulement). Le premier appel de chaque
// route est exclu par une chauffe (NF-PERF-02 exclut le premier appel après une mise en veille).
import { writeFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import autocannon from 'autocannon';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import type { Database } from '../src/db/connection.js';
import { DB } from '../src/db/database.module.js';
import { eq } from 'drizzle-orm';
import { expense, spendingLimit } from '../src/db/schema/index.js';
import { newId } from '../src/db/uuid.js';
import type { Tenant } from '../test/support/access.js';
import { TEST_ENV } from '../test/support/app.js';
import { expenseClient } from '../test/support/expenses.js';
import { FakeClock } from '../test/support/clock.js';

export const EXPENSE_COUNT = 10_000;
export const P95_BUDGET_MS = 300;
/** Connexions simultanées : un compte actif et quelques autres, à l'échelle d'un mutualisé. */
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 4);
const DURATION_S = Number(process.env.BENCH_DURATION_S ?? 5);
const WARMUP_REQUESTS = 10;

const MERCHANTS = ['Boulangerie', 'Carrefour', 'SNCF', 'Pharmacie', 'Cinéma', 'Garage', 'Marché'];

/** Rang `q` (0 ≤ q ≤ 1) par la méthode du rang supérieur (« nearest rank »). */
export function percentile(samples: readonly number[], q: number): number {
  if (samples.length === 0) throw new Error('aucun échantillon');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1]!;
}

/** Journal jeté : la sérialisation pino reste mesurée, sans accumuler les lignes en mémoire. */
class NullLog extends Writable {
  override _write(_chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    done();
  }
}

/** 10 000 dépenses réparties sur deux ans glissants, insérées par lots. */
async function seed(db: Database, t: Tenant, categoryId: string, today: Temporal.PlainDate) {
  const stamp = new Date();
  const rows = Array.from({ length: EXPENSE_COUNT }, (_, i) => ({
    id: newId(),
    notebookId: t.notebookId,
    // Montants déterministes entre 0,50 € et 250 €.
    amount: 50 + ((i * 7_919) % 24_951),
    currency: 'EUR',
    categoryId,
    spentOn: today.subtract({ days: i % 730 }).toString(),
    note: i % 3 === 0 ? `Note ${i}` : null,
    merchant: MERCHANTS[i % MERCHANTS.length]!,
    source: 'manual' as const,
    createdAt: stamp,
    updatedAt: new Date(stamp.getTime() - i * 60_000),
    deletedAt: i % 50 === 0 ? stamp : null,
  }));
  for (let i = 0; i < rows.length; i += 1_000) {
    await db.insert(expense).values(rows.slice(i, i + 1_000));
  }
}

interface Scenario {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  /** Corps de chaque requête (une nouvelle dépense par appel pour la création). */
  body?: () => string;
}

interface Result {
  name: string;
  requests: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: number;
}

async function measure(base: string, token: string, s: Scenario): Promise<Result> {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const request = {
    method: s.method,
    path: s.path,
    headers,
    ...(s.body
      ? {
          setupRequest: (req: autocannon.Request) => ({ ...req, body: s.body!() }),
        }
      : {}),
  };
  // Chauffe : premier appel de la route (plans de requête, JIT) hors mesure.
  await autocannon({ url: base, amount: WARMUP_REQUESTS, connections: 1, requests: [request] });

  const times: number[] = [];
  let errors = 0;
  const summary = await new Promise<autocannon.Result>((resolve, reject) => {
    const instance = autocannon(
      { url: base, connections: CONNECTIONS, duration: DURATION_S, requests: [request] },
      (err: unknown, result) =>
        err
          ? reject(err instanceof Error ? err : new Error('autocannon a échoué', { cause: err }))
          : resolve(result),
    );
    instance.on('response', (_client, statusCode, _bytes, responseTime) => {
      times.push(responseTime);
      if (statusCode >= 300) errors += 1;
    });
  });
  errors += summary.errors; // timeouts déjà inclus dans `errors` par autocannon
  return {
    name: s.name,
    requests: times.length,
    p50: percentile(times, 0.5),
    p95: percentile(times, 0.95),
    p99: percentile(times, 0.99),
    max: Math.max(...times),
    errors,
  };
}

describe(`banc p95 (${EXPENSE_COUNT} dépenses, NF-PERF-02)`, () => {
  let app: INestApplication;
  let base: string;
  let t: Tenant;
  let categoryId: string;
  let today: Temporal.PlainDate;
  const results: Result[] = [];

  beforeAll(async () => {
    app = await createApp(loadConfig(TEST_ENV), { logDestination: new NullLog() });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const db = app.get<Database>(DB);
    const clock = new FakeClock(Date.now());
    const client = expenseClient(() => app, db, clock);
    ({ t, categoryId } = await client.tenant());
    // Dates passées seulement : le jour UTC suffit, quel que soit le fuseau du compte.
    today = Temporal.Now.plainDateISO('UTC');
    await seed(db, t, categoryId, today);
    // Limite globale à deux versions (une datée d'il y a un an) : accueil et limites calculent
    // les périodes et l'historique au lieu du cas « sans limite ».
    const postLimit = async (amount: number) => {
      const id = newId();
      const res = await fetch(`${base}/api/v1/notebooks/${t.notebookId}/limits`, {
        method: 'POST',
        headers: { authorization: `Bearer ${t.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id, amount }),
      });
      if (res.status !== 201) throw new Error(`limite non créée (${res.status})`);
      return id;
    };
    const first = await postLimit(150_000);
    await db
      .update(spendingLimit)
      .set({ effectiveDate: today.subtract({ years: 1 }).toString() })
      .where(eq(spendingLimit.id, first));
    await postLimit(200_000);
  }, 120_000);

  afterAll(async () => {
    if (results.length > 0) {
      const out = process.env.BENCH_REPORT;
      if (out) await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
      console.table(results);
    }
    await app?.close();
  });

  const nb = () => `/api/v1/notebooks/${t.notebookId}`;
  const scenarios = (): Scenario[] => [
    { name: 'accueil', method: 'GET', path: `${nb()}/dashboard` },
    { name: 'liste', method: 'GET', path: `${nb()}/expenses` },
    {
      name: 'recherche',
      method: 'GET',
      path: `${nb()}/expenses?q=carrefour&from=${today.subtract({ days: 365 }).toString()}&to=${today.toString()}&limit=100`,
    },
    {
      name: 'synchro complète (1re page)',
      method: 'GET',
      path: `${nb()}/sync?limit=500`,
    },
    { name: 'catégories', method: 'GET', path: `${nb()}/categories` },
    { name: 'limites en cours', method: 'GET', path: `${nb()}/limits/current?past=12` },
    {
      name: 'saisie',
      method: 'POST',
      path: `${nb()}/expenses`,
      body: () =>
        JSON.stringify({ id: newId(), amount: 1_250, categoryId, date: today.toString() }),
    },
  ];

  it('chaque route clé répond à 95 % en moins de 300 ms', async () => {
    for (const s of scenarios()) results.push(await measure(base, t.accessToken, s));
    for (const r of results) {
      expect.soft(r.errors, `${r.name} : réponses en erreur`).toBe(0);
      expect.soft(r.requests, `${r.name} : trop peu d'appels mesurés`).toBeGreaterThanOrEqual(50);
      expect.soft(r.p95, `${r.name} : p95 (ms)`).toBeLessThan(P95_BUDGET_MS);
    }
  }, 300_000);
});

describe('percentile (rang supérieur)', () => {
  it('renvoie la valeur au rang ⌈q·n⌉ des échantillons triés', () => {
    const samples = Array.from({ length: 100 }, (_, i) => 100 - i); // 100…1, non trié
    expect(percentile(samples, 0.95)).toBe(95);
    expect(percentile(samples, 0.5)).toBe(50);
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(() => percentile([], 0.95)).toThrow();
  });
});
