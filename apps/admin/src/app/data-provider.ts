// Fournisseur de données React-admin sur l'API admin (F-ADM-01, ADR-043/044) : lecture seule,
// listes paginées par curseur opaque `{ items, nextCursor }` traduites en pagination partielle
// (page suivante / précédente), sans total. Aucun calcul métier ici (invariant 8).
import type { DataProvider, GetListParams, GetListResult, RaRecord } from 'react-admin';
import type { AdminFetch } from './admin-api';

/** Filtres acceptés par chaque liste (objets stricts côté API : rien d'autre n'est transmis). */
export const LIST_FILTERS = {
  users: ['q'],
  subscriptions: ['userId', 'store', 'status'],
  jobs: ['status'],
  audit: ['actorUserId', 'targetId', 'action'],
} as const;

/** Valeurs par défaut des filtres (la liste des tâches n'affiche que les échecs). */
const DEFAULT_FILTERS: Partial<Record<AdminResource, Record<string, string>>> = {
  jobs: { status: 'failed' },
};

export type AdminResource = keyof typeof LIST_FILTERS;

const MAX_PAGE_SIZE = 100;

interface AdminPage {
  items: RaRecord[];
  nextCursor: string | null;
}

export interface AdminDataProvider extends DataProvider {
  retryJob(id: string): Promise<void>;
  getStats(): Promise<unknown>;
}

function resourceOf(resource: string): AdminResource {
  if (!Object.hasOwn(LIST_FILTERS, resource)) {
    throw new Error(`Ressource inconnue du back-office : ${resource}`);
  }
  return resource as AdminResource;
}

function readOnly(): Promise<never> {
  return Promise.reject(new Error('Back-office en lecture seule'));
}

export function createDataProvider(fetchJson: AdminFetch): AdminDataProvider {
  /** Curseur de chaque page déjà atteinte, par liste (ressource + filtres + taille). */
  const cursors = new Map<string, Map<number, string>>();

  async function getList(resource: string, params: GetListParams): Promise<GetListResult> {
    const name = resourceOf(resource);
    const page = params.pagination?.page ?? 1;
    const limit = Math.min(params.pagination?.perPage ?? 50, MAX_PAGE_SIZE);
    const filter = { ...DEFAULT_FILTERS[name], ...(params.filter as Record<string, unknown>) };
    const query = new URLSearchParams();
    for (const key of LIST_FILTERS[name]) {
      const value = filter[key];
      if (typeof value === 'string' && value.trim() !== '') query.set(key, value.trim());
    }
    query.set('limit', String(limit));
    const listKey = `${name}?${query.toString()}`;
    const known = cursors.get(listKey) ?? new Map<number, string>();
    cursors.set(listKey, known);
    if (page > 1) {
      const cursor = known.get(page);
      if (!cursor) throw new Error('Pagination expirée : revenir à la première page');
      query.set('cursor', cursor);
    }
    const result = (await fetchJson(`/${name}?${query.toString()}`)) as AdminPage;
    if (result.nextCursor) known.set(page + 1, result.nextCursor);
    return {
      data: result.items,
      pageInfo: { hasNextPage: result.nextCursor !== null, hasPreviousPage: page > 1 },
    };
  }

  return {
    getList,
    async getOne(resource, params) {
      if (resourceOf(resource) !== 'users') throw new Error(`Pas de fiche pour ${resource}`);
      const data = (await fetchJson(`/users/${encodeURIComponent(String(params.id))}`)) as RaRecord;
      return { data } as never;
    },
    getMany: readOnly,
    getManyReference: readOnly,
    create: readOnly,
    update: readOnly,
    updateMany: readOnly,
    delete: readOnly,
    deleteMany: readOnly,
    async retryJob(id) {
      await fetchJson(`/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    },
    getStats: () => fetchJson('/stats'),
  };
}
