// Configuration lue uniquement dans les variables d'environnement (NF-SEC-01, ADR-013).
// Un secret absent ou invalide empêche le démarrage ; le message nomme la variable, jamais sa valeur.
import { isAbsolute } from 'node:path';
import { z } from 'zod';

/** Liste d'identifiants séparés par des virgules ; vide ou absente = fournisseur désactivé. */
const clientIds = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

/** mysql://compte:mot_de_passe@hôte:port/base ; base obligatoire, pas de paramètres de requête. */
export const databaseUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  // Paramètres de requête refusés : ils seraient ignorés par connection.ts.
  return url.protocol === 'mysql:' && url.pathname.length > 1 && url.search === '';
});

/** Clé privée PKCS#8 en PEM ; les `\n` échappés (variable sur une ligne) sont restaurés. */
export const pkcs8Pem = z
  .string()
  .transform((value) => value.replace(/\\n/g, '\n'))
  .refine((value) => value.includes('-----BEGIN PRIVATE KEY-----'));

/** Clé AES-256 en base64 (32 octets). */
export const aes256Key = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Clé HMAC des jetons d'accès (P1-06) : au moins 32 caractères. */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** mysql://compte:mot_de_passe@hôte:port/base — compte API (DML seul, §8.2). */
  DATABASE_URL: databaseUrl,
  /** Connexions simultanées par processus Passenger (ADR-014). */
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  /** Connexion Apple (ADR-020) : bundle ID iOS et Services ID web acceptés pour `aud`. */
  APPLE_CLIENT_IDS: clientIds,
  /** Connexion Google (ADR-020) : identifiants de client OAuth (Android, iOS, web) pour `aud`. */
  GOOGLE_CLIENT_IDS: clientIds,
  /**
   * Fichiers servis par l'API (exports, ADR-036) : dossier absolu **hors du dossier public**, et
   * clé AES-256 en base64 (32 octets). Les deux ou aucune ; absentes = exports indisponibles (503).
   */
  FILE_STORAGE_DIR: z
    .string()
    .refine((value) => isAbsolute(value))
    .optional(),
  FILE_ENCRYPTION_KEY: aes256Key.optional(),
  /**
   * App Store Server API (abonnements, ADR-040) : clé d'API In-App Purchase (issuer, key ID, clé
   * PKCS#8) et bundle iOS. Toutes ou aucune ; absentes = vérification App Store indisponible (503).
   */
  APP_STORE_ISSUER_ID: z.guid().optional(),
  APP_STORE_KEY_ID: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .optional(),
  APP_STORE_PRIVATE_KEY: pkcs8Pem.optional(),
  APP_STORE_BUNDLE_ID: z.string().min(1).max(155).optional(),
  APP_STORE_ENVIRONMENT: z.enum(['production', 'sandbox']).default('production'),
  /**
   * Google Play Developer API (abonnements, ADR-040) : nom du paquet Android et compte de service
   * (adresse, clé PKCS#8). Toutes ou aucune ; absentes = vérification Google Play indisponible (503).
   */
  GOOGLE_PLAY_PACKAGE_NAME: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/)
    .max(255)
    .optional(),
  GOOGLE_PLAY_CLIENT_EMAIL: z.email().optional(),
  GOOGLE_PLAY_PRIVATE_KEY: pkcs8Pem.optional(),
});

/** Variables qui ne vont que par groupe complet (toutes ou aucune). */
const COMPLETE_GROUPS = [
  ['FILE_STORAGE_DIR', 'FILE_ENCRYPTION_KEY'],
  ['APP_STORE_ISSUER_ID', 'APP_STORE_KEY_ID', 'APP_STORE_PRIVATE_KEY', 'APP_STORE_BUNDLE_ID'],
  ['GOOGLE_PLAY_PACKAGE_NAME', 'GOOGLE_PLAY_CLIENT_EMAIL', 'GOOGLE_PLAY_PRIVATE_KEY'],
] as const;

function assertComplete<T extends object>(config: T): T {
  const values = config as Record<string, unknown>;
  const missing = COMPLETE_GROUPS.flatMap((group) => {
    const missing = group.filter((key) => values[key] === undefined);
    // Groupe vide ou hors du schéma (ex. stores pour le cron) : rien à exiger.
    return missing.length === group.length ? [] : missing;
  });
  if (missing.length > 0) {
    throw new ConfigError(
      `Configuration invalide, démarrage refusé — ${missing.map((k) => `${k} : absente`).join(' ; ')}`,
    );
  }
  return config;
}

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
  FILE_STORAGE_DIR: true,
  FILE_ENCRYPTION_KEY: true,
});
export type WorkerConfig = Readonly<z.infer<typeof workerSchema>>;

/**
 * Envoi d'e-mails par le script cron (ADR-017) : requis par `jobs-run`, pas par l'API HTTP.
 * `SMTP_URL` = smtps://compte:mot_de_passe@hôte:465 ; `PUBLIC_WEB_URL` = origine des liens envoyés.
 */
const mailSchema = z.object({
  SMTP_URL: z.string().refine((value) => {
    if (!URL.canParse(value)) return false;
    return ['smtp:', 'smtps:'].includes(new URL(value).protocol);
  }),
  MAIL_FROM: z.string().min(3).max(254),
  PUBLIC_WEB_URL: z.string().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === 'https:' && url.pathname === '/' && url.search === '' && url.hash === ''
    );
  }),
});
export type MailConfig = Readonly<z.infer<typeof mailSchema>>;

export function loadMailConfig(env: Readonly<Record<string, string | undefined>>): MailConfig {
  return parseEnv(mailSchema, env);
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  return assertComplete(parseEnv(schema, env));
}

export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  return assertComplete(parseEnv(workerSchema, env));
}

export function parseEnv<T extends z.ZodType>(
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
