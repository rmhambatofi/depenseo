// Suivi des erreurs (NF-QUA-02) chez Sentry, région UE (§8.1, ADR-064). Rien d'autre que le type de
// l'erreur, sa pile (sans variables ni source), la méthode et le chemin HTTP ne quitte l'API :
// les messages d'erreur, corps, en-têtes, cookies, utilisateur et données libres peuvent porter un
// montant ou une donnée personnelle (NF-SEC-06), comme pour les journaux (logging/redact.ts).
import * as Sentry from '@sentry/node';
import type { Breadcrumb, ErrorEvent, Exception, NodeOptions, StackFrame } from '@sentry/node';
import type { AppConfig } from '../config/env.js';
import { pathOnly } from '../logging/pino-options.js';
import { redactDeep } from '../logging/redact.js';

/** En-têtes de requête transmis : aucun ne porte d'identité, de jeton ni d'adresse IP. */
const SAFE_HEADERS = new Set(['content-type', 'content-length', 'accept', 'user-agent']);

function withoutQuery(url: unknown): unknown {
  return typeof url === 'string' ? pathOnly(url) : undefined;
}

/** Copie de `value` réduite aux clés `keys` définies (liste blanche). */
function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(
    keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
  ) as Pick<T, K>;
}

/** Contextes ajoutés par le SDK, sans donnée applicative ; tout autre contexte est retiré. */
const KEPT_CONTEXTS = new Set([
  'runtime',
  'os',
  'device',
  'app',
  'culture',
  'cloud_resource',
  'trace',
]);

function scrubFrame(frame: StackFrame): StackFrame {
  // Ni `vars` (variables locales), ni lignes de source : seule la position dans le code reste.
  return pick(frame, ['filename', 'module', 'function', 'lineno', 'colno', 'abs_path', 'in_app']);
}

function scrubException(exception: Exception): Exception {
  // `value` = message de l'erreur (mysql2, Drizzle, validation…) : retiré comme dans describeError.
  // `mechanism` réduit à son type : `data` est libre.
  const { stacktrace, mechanism } = exception;
  return {
    ...pick(exception, ['type', 'module', 'thread_id']),
    ...(mechanism ? { mechanism: pick(mechanism, ['type', 'handled', 'synthetic']) } : {}),
    ...(stacktrace ? { stacktrace: { frames: stacktrace.frames?.map(scrubFrame) } } : {}),
  };
}

function scrubData(data: unknown): Record<string, unknown> | undefined {
  if (data === null || typeof data !== 'object') return undefined;
  const redacted = redactDeep(data) as Record<string, unknown>;
  return 'url' in redacted ? { ...redacted, url: withoutQuery(redacted.url) } : redacted;
}

/** Fil d'Ariane sans message libre ; données expurgées, URL sans paramètres. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const scrubbed = scrubData(breadcrumb.data);
  return {
    ...pick(breadcrumb, ['type', 'level', 'event_id', 'category', 'timestamp']),
    ...(scrubbed ? { data: scrubbed } : {}),
  };
}

/**
 * `beforeSend` : nouvel événement bâti par **liste blanche** (une montée de version du SDK qui
 * ajouterait un champ ne le ferait pas partir). Retirés : message, `logentry`, utilisateur, `extra`
 * (où le SDK recopie un objet lancé), tags, valeur des exceptions, corps, cookies, en-têtes autres
 * que techniques, paramètres d'URL.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, exception, contexts, breadcrumbs } = event;
  const headers = Object.fromEntries(
    Object.entries(request?.headers ?? {}).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
  );
  const keptContexts = Object.fromEntries(
    Object.entries(contexts ?? {}).filter(([name]) => KEPT_CONTEXTS.has(name)),
  );
  return {
    ...pick(event, [
      'type',
      'event_id',
      'timestamp',
      'start_timestamp',
      'level',
      'platform',
      'environment',
      'release',
      'dist',
      'sdk',
      'transaction',
      'debug_meta',
    ]),
    ...(exception ? { exception: { values: exception.values?.map(scrubException) } } : {}),
    ...(request
      ? {
          request: {
            ...(request.method ? { method: request.method } : {}),
            ...(request.url ? { url: pathOnly(request.url) } : {}),
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
          },
        }
      : {}),
    ...(Object.keys(keptContexts).length > 0 ? { contexts: keptContexts } : {}),
    ...(breadcrumbs ? { breadcrumbs: breadcrumbs.map(scrubBreadcrumb) } : {}),
  };
}

/**
 * Initialise Sentry si `SENTRY_DSN` est défini (sinon `captureException` reste sans effet).
 * Intégrations choisies une à une : ni HTTP, ni console, ni données de requête, ni OpenTelemetry.
 */
export function initSentry(
  config: AppConfig,
  overrides: Pick<NodeOptions, 'transport'> = {},
): boolean {
  if (config.SENTRY_DSN === undefined) return false;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
    ...(config.SENTRY_RELEASE ? { release: config.SENTRY_RELEASE } : {}),
    // Collecte minimale à la source (Sentry 11 : remplace `sendDefaultPii`) ; beforeSend en plus.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    includeLocalVariables: false,
    includeServerName: false,
    enableRuntimeChannelInjection: false,
    defaultIntegrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    ...overrides,
  });
  return true;
}

/** Signalement d'une erreur inattendue (filtre RFC 9457). */
export function reportError(error: unknown): void {
  Sentry.captureException(error);
}
