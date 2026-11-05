// Accès à l'API du back-office (`/admin/api/*`, ADR-042) : cookie de session `Path=/admin` envoyé
// par le navigateur (même origine), aucune donnée stockée côté client.

export const ADMIN_API = '/admin/api';

/**
 * Identifiant de client envoyé à chaque appel : sert aussi de sentinelle à
 * `scripts/check-no-admin-code.mjs` (sa présence dans un bundle public = fuite de code admin).
 */
export const ADMIN_CLIENT_ID = 'depenseo-admin-app';

/** Erreur HTTP de l'API admin ; `status` est lu par l'`authProvider` (`checkError`). */
export class AdminHttpError extends Error {
  constructor(readonly status: number) {
    super(status === 404 ? 'Introuvable ou session expirée' : `Erreur ${status}`);
    this.name = 'AdminHttpError';
  }
}

/** Appel JSON relatif à `/admin/api` ; 204 → `undefined`. */
export type AdminFetch = (
  path: string,
  init?: { method?: 'GET' | 'POST' | 'DELETE' },
) => Promise<unknown>;

export const adminFetch: AdminFetch = async (path, init = {}) => {
  const res = await fetch(`${ADMIN_API}${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Depenseo-Client': ADMIN_CLIENT_ID },
  });
  if (!res.ok) throw new AdminHttpError(res.status);
  return res.status === 204 ? undefined : ((await res.json()) as unknown);
};
