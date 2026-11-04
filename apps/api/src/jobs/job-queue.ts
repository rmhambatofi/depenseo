// File de tâches de fond (§8.2) : une tâche est écrite dans la transaction de la donnée qui la
// motive (rien n'est envoyé si la donnée est annulée), puis traitée par le cron (job-runner.ts).
import { eq, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';
import type { Clock } from '../clock.js';
import type { Database } from '../db/connection.js';
import { job } from '../db/schema/index.js';
import { newId } from '../db/uuid.js';
import { isSensitiveKey } from '../logging/redact.js';

export interface JobDefinition<P> {
  readonly type: string;
  readonly payload: ZodType<P>;
}

/**
 * Type de tâche et schéma de sa charge utile. La charge utile ne porte que des identifiants et
 * des codes : jamais d'e-mail, de montant, de note ni de secret (NF-SEC-06), car elle est stockée
 * en clair et peut apparaître dans un diagnostic. Le gestionnaire relit le reste en base.
 */
export function defineJob<P>(type: string, payload: ZodType<P>): JobDefinition<P> {
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(type)) throw new TypeError('Type de tâche invalide');
  return { type, payload };
}

/** Charge utile refusée ; le message nomme le chemin fautif, jamais la valeur. */
export class JobPayloadError extends Error {
  override readonly name = 'JobPayloadError';
}

/** Taille maximale d'une charge utile sérialisée : des identifiants, pas des documents. */
export const MAX_PAYLOAD_BYTES = 4_096;

/** Une chaîne contenant « @ » entre deux mots est traitée comme une adresse e-mail. */
const EMAIL_LIKE = /\S@\S/;

/** Lève si une clé sensible (montant, e-mail, note, jeton…) ou une valeur e-mail apparaît. */
export function assertNoPersonalData(value: unknown, path = 'payload'): void {
  if (typeof value === 'string') {
    if (EMAIL_LIKE.test(value)) throw new JobPayloadError(`${path} : adresse e-mail interdite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPersonalData(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (isSensitiveKey(key)) throw new JobPayloadError(`${path}.${key} : clé sensible interdite`);
      assertNoPersonalData(inner, `${path}.${key}`);
    }
  }
}

/** Valide une charge utile contre le schéma de son type puis contre la règle « sans PII ». */
export function parsePayload<P>(definition: JobDefinition<P>, value: unknown): P {
  const parsed = definition.payload.safeParse(value);
  if (!parsed.success) {
    // Messages zod génériques (chemin, code) : ils ne recopient pas la valeur reçue.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(racine)'} ${i.code}`);
    throw new JobPayloadError(`Charge utile ${definition.type} invalide : ${issues.join(' ; ')}`);
  }
  assertNoPersonalData(parsed.data);
  return parsed.data;
}

/** Exécuteur de requêtes : le client racine ou une transaction Drizzle. */
export type QueryExecutor = Pick<Database, 'insert' | 'select'>;

export interface EnqueueOptions {
  /** Échéance (UTC) ; maintenant par défaut. */
  runAt?: Date;
  /** Clé d'idempotence (ex. `occurrence:<id>`) : un second ajout avec la même clé est ignoré. */
  uniqueKey?: string;
}

export interface EnqueueResult {
  id: string;
  /** `false` si une tâche portait déjà cette clé d'unicité. */
  created: boolean;
}

export class JobQueue {
  constructor(private readonly clock: Clock) {}

  /** À appeler avec le `tx` de la transaction qui écrit la donnée motivant la tâche. */
  async enqueue<P>(
    tx: QueryExecutor,
    definition: JobDefinition<P>,
    payload: P,
    options: EnqueueOptions = {},
  ): Promise<EnqueueResult> {
    const data = parsePayload(definition, payload);
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new JobPayloadError(`Charge utile ${definition.type} trop volumineuse`);
    }
    const now = this.clock.now();
    const id = newId();
    await tx
      .insert(job)
      .values({
        id,
        type: definition.type,
        payload: serialized,
        status: 'pending',
        runAt: options.runAt ?? now,
        uniqueKey: options.uniqueKey ?? null,
        createdAt: now,
        updatedAt: now,
      })
      // Doublon de clé d'unicité : aucune modification, la tâche existante reste. `affectedRows`
      // ne permet pas de trancher (mysql2 active CLIENT_FOUND_ROWS) : on relit par la clé.
      .onDuplicateKeyUpdate({ set: { id: sql`${job.id}` } });
    if (options.uniqueKey === undefined) return { id, created: true };
    const [existing] = await tx
      .select({ id: job.id })
      .from(job)
      .where(eq(job.uniqueKey, options.uniqueKey));
    if (!existing) throw new Error('Tâche introuvable après insertion');
    return { id: existing.id, created: existing.id === id };
  }
}
