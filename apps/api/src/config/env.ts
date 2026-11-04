// Configuration lue uniquement dans les variables d'environnement (NF-SEC-01, ADR-013).
// Un secret absent ou invalide empêche le démarrage ; le message nomme la variable, jamais sa valeur.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Clé HMAC des jetons d'accès (P1-06) : au moins 32 caractères. */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** mysql://compte:mot_de_passe@hôte:port/base — compte API (DML seul, §8.2). */
  DATABASE_URL: z.string().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    // Base obligatoire ; pas de paramètres de requête : ils seraient ignorés par connection.ts.
    return url.protocol === 'mysql:' && url.pathname.length > 1 && url.search === '';
  }),
  /** Connexions simultanées par processus Passenger (ADR-014). */
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),
});

export type AppConfig = Readonly<z.infer<typeof schema>>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Variables utiles au script cron de la file de tâches (`scripts/jobs-run.ts`). */
const workerSchema = schema.pick({
  NODE_ENV: true,
  LOG_LEVEL: true,
  DATABASE_URL: true,
  DB_POOL_SIZE: true,
});
export type WorkerConfig = Readonly<z.infer<typeof workerSchema>>;

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  return parseEnv(schema, env);
}

export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  return parseEnv(workerSchema, env);
}

function parseEnv<T extends z.ZodType>(
  envSchema: T,
  env: Readonly<Record<string, string | undefined>>,
): Readonly<z.infer<T>> {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) return Object.freeze(parsed.data);
  // Messages zod génériques (type, longueur) : ils ne recopient pas la valeur reçue.
  const problems = parsed.error.issues.map(
    (issue) =>
      `${issue.path.join('.')} : ${issue.code === 'invalid_type' ? 'absente' : 'invalide'}`,
  );
  throw new ConfigError(`Configuration invalide, démarrage refusé — ${problems.join(' ; ')}`);
}
