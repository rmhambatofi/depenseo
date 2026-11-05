// Limitation de débit des routes d'authentification (NF-SEC-04, ADR-062). Compteur à fenêtre fixe
// partagé par tous les processus Passenger : la base est la seule mémoire commune (§8.4).
import { index, int, mysqlTable } from 'drizzle-orm/mysql-core';
import { sha256Binary, utcDateTime } from './columns.js';

export const rateLimit = mysqlTable(
  'rate_limit',
  {
    /** SHA-256 de « portée + valeur » (adresse IP, e-mail) : ni adresse ni e-mail en clair. */
    bucket: sha256Binary('bucket').primaryKey(),
    windowStartedAt: utcDateTime('window_started_at').notNull(),
    hits: int('hits').notNull(),
  },
  (t) => [
    /** Purge des fenêtres échues. */
    index('rate_limit_window_idx').on(t.windowStartedAt),
  ],
);
