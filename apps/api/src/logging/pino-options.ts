// Options pino-http : JSON, requêtes réduites à méthode + chemin (sans chaîne de requête,
// ni en-têtes, ni corps), et expurgation récursive de tout objet journalisé.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { AppConfig } from '../config/env.js';
import { redactDeep } from './redact.js';

interface RequestWithRoute extends IncomingMessage {
  originalUrl?: string;
}

export function pathOnly(url: string | undefined): string {
  if (!url) return '';
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

export function pinoHttpOptions(config: AppConfig): Options {
  return {
    level: config.LOG_LEVEL,
    // Pas de corps, d'en-têtes ni de paramètres de requête : ils peuvent porter des données personnelles.
    serializers: {
      req: (req: RequestWithRoute) => ({
        id: req.id,
        method: req.method,
        path: pathOnly(req.originalUrl ?? req.url),
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
    formatters: {
      log: (object) => redactDeep(object) as Record<string, unknown>,
    },
  };
}
