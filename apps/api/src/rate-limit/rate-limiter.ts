// Compteur à fenêtre fixe en base (NF-SEC-04, ADR-062) : Passenger lance plusieurs processus sans
// mémoire commune, et aucun service permanent (Redis…) n'est disponible chez o2switch (§8.4).
import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { rateLimit } from '../db/schema/index.js';
import { withTransaction } from '../db/transaction.js';

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const WINDOW_S = RATE_LIMIT_WINDOW_MS / 1000;

export type RateLimitScope = 'ip' | 'account';

/** Clé HMAC des seaux, dérivée du secret des jetons d'accès (aucun secret de plus à gérer). */
export function rateLimitKey(jwtAccessSecret: string): Buffer {
  return createHmac('sha256', jwtAccessSecret).update('depenseo/rate-limit').digest();
}

/**
 * Empreinte HMAC-SHA-256 du seau : une IPv4 ou un e-mail ne se retrouvent pas par force brute sans
 * la clé. Donnée pseudonymisée, conservée au plus une fenêtre plus la période de purge.
 */
export function bucketKey(key: Buffer, scope: RateLimitScope, value: string): Buffer {
  return createHmac('sha256', key).update(`${scope}\0${value}`).digest();
}

export interface RateLimitBucket {
  scope: RateLimitScope;
  value: string;
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Secondes avant réouverture du seau le plus contraignant, dans [1, 900] (0 si autorisé). */
  retryAfterS: number;
}

/**
 * Compte une tentative dans chaque seau, qu'elle soit refusée ou non, et chaque seau même si un
 * autre refuse : un attaquant qui insiste reste bloqué jusqu'à la fin de la fenêtre.
 */
export async function consume(
  db: Database,
  key: Buffer,
  buckets: readonly RateLimitBucket[],
  now: Date,
): Promise<RateLimitDecision> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  let retryAfterS = 0;
  for (const { scope, value, max } of buckets) {
    const bucket = bucketKey(key, scope, value);
    const row = await withTransaction(db, async (tx) => {
      // SQL écrit à la main : Drizzle émet les affectations dans l'ordre des colonnes de la table.
      // `window_started_at` est affectée en dernier, donc les deux conditions lisent sa valeur
      // d'origine, quel que soit le mode d'affectation (MariaDB `SIMULTANEOUS_ASSIGNMENT`).
      await tx.execute(sql`
        INSERT INTO rate_limit (bucket, window_started_at, hits) VALUES (${bucket}, ${now}, 1)
        ON DUPLICATE KEY UPDATE
          hits = IF(window_started_at <= ${cutoff}, 1, hits + 1),
          window_started_at = IF(window_started_at <= ${cutoff}, ${now}, window_started_at)`);
      const [current] = await tx
        .select({ hits: rateLimit.hits, windowStartedAt: rateLimit.windowStartedAt })
        .from(rateLimit)
        .where(sql`${rateLimit.bucket} = ${bucket}`);
      return current;
    });
    if (row && row.hits > max) {
      const reopensInMs = row.windowStartedAt.getTime() + RATE_LIMIT_WINDOW_MS - now.getTime();
      // Bornée : une horloge de processus en retard ne doit pas annoncer plus d'une fenêtre.
      const seconds = Math.min(WINDOW_S, Math.max(1, Math.ceil(reopensInMs / 1000)));
      retryAfterS = Math.max(retryAfterS, seconds);
    }
  }
  return { allowed: retryAfterS === 0, retryAfterS };
}
