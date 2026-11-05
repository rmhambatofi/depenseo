import createClient, { type Client, type ClientOptions, type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type { components, operations, paths } from './schema.js';

export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  /** Origine de l'API (les chemins du contrat commencent déjà par `/api/v1`). */
  baseUrl: string;
  /** `fetch` injecté (tests, environnements sans `globalThis.fetch`). */
  fetch?: ClientOptions['fetch'];
  /** Jeton d'accès courant, relu à chaque requête ; `undefined` = requête anonyme. */
  accessToken?: () => string | undefined | Promise<string | undefined>;
}

/** Client typé par le contrat OpenAPI de l'API Depenseo. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const { accessToken } = options;
  if (accessToken) client.use(bearer(accessToken));
  return client;
}

function bearer(accessToken: NonNullable<ApiClientOptions['accessToken']>): Middleware {
  return {
    async onRequest({ request }) {
      const token = await accessToken();
      if (token) request.headers.set('authorization', `Bearer ${token}`);
      return request;
    },
  };
}
