import { describe, expect, it } from 'vitest';
import { type AdminFetch, AdminHttpError } from './admin-api';
import { createDataProvider } from './data-provider';

interface Call {
  path: string;
  method: string;
}

/** Faux `/admin/api` : réponses programmées par chemin exact (requête comprise). */
function fakeApi(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchJson: AdminFetch = (path, init = {}) => {
    calls.push({ path, method: init.method ?? 'GET' });
    if (!(path in responses)) return Promise.reject(new AdminHttpError(404));
    return Promise.resolve(responses[path]);
  };
  return { calls, fetchJson };
}

const list = (perPage: number, page: number, filter: object = {}) => ({
  pagination: { page, perPage },
  sort: { field: 'createdAt', order: 'DESC' as const },
  filter,
});

describe('getList', () => {
  it('suit les curseurs : page suivante avec nextCursor, page précédente rejouée', async () => {
    const { calls, fetchJson } = fakeApi({
      '/users?limit=2': { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'c1' },
      '/users?limit=2&cursor=c1': { items: [{ id: 'c' }, { id: 'd' }], nextCursor: 'c2' },
      '/users?limit=2&cursor=c2': { items: [{ id: 'e' }], nextCursor: null },
    });
    const provider = createDataProvider(fetchJson);
    const first = await provider.getList('users', list(2, 1));
    expect(first).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      pageInfo: { hasNextPage: true, hasPreviousPage: false },
    });
    const second = await provider.getList('users', list(2, 2));
    expect(second.pageInfo).toEqual({ hasNextPage: true, hasPreviousPage: true });
    const third = await provider.getList('users', list(2, 3));
    expect(third).toEqual({
      data: [{ id: 'e' }],
      pageInfo: { hasNextPage: false, hasPreviousPage: true },
    });
    const back = await provider.getList('users', list(2, 2));
    expect(back.data).toEqual([{ id: 'c' }, { id: 'd' }]);
    expect(calls.map((c) => c.path)).toEqual([
      '/users?limit=2',
      '/users?limit=2&cursor=c1',
      '/users?limit=2&cursor=c2',
      '/users?limit=2&cursor=c1',
    ]);
  });

  it('transmet seulement les filtres connus de la ressource, non vides', async () => {
    const { calls, fetchJson } = fakeApi({
      '/users?q=ali%40ex&limit=50': { items: [], nextCursor: null },
      '/subscriptions?userId=u1&store=app_store&status=active&limit=50': {
        items: [],
        nextCursor: null,
      },
      '/jobs?status=failed&limit=50': { items: [], nextCursor: null },
      '/audit?actorUserId=u1&targetId=t1&action=admin.user_view&limit=50': {
        items: [],
        nextCursor: null,
      },
    });
    const provider = createDataProvider(fetchJson);
    await provider.getList('users', list(50, 1, { q: 'ali@ex', role: 'admin', email: '' }));
    await provider.getList(
      'subscriptions',
      list(50, 1, { userId: 'u1', store: 'app_store', status: 'active', q: 'x' }),
    );
    await provider.getList('jobs', list(50, 1, {}));
    await provider.getList(
      'audit',
      list(50, 1, { actorUserId: 'u1', targetId: 't1', action: 'admin.user_view', route: 'x' }),
    );
    expect(calls.map((c) => c.path)).toEqual([
      '/users?q=ali%40ex&limit=50',
      '/subscriptions?userId=u1&store=app_store&status=active&limit=50',
      '/jobs?status=failed&limit=50',
      '/audit?actorUserId=u1&targetId=t1&action=admin.user_view&limit=50',
    ]);
  });

  it('les curseurs dépendent des filtres et de la taille de page', async () => {
    const { calls, fetchJson } = fakeApi({
      '/users?q=a&limit=1': { items: [{ id: 'a' }], nextCursor: 'qa' },
      '/users?q=b&limit=1': { items: [{ id: 'b' }], nextCursor: 'qb' },
      '/users?q=a&limit=1&cursor=qa': { items: [{ id: 'a2' }], nextCursor: null },
    });
    const provider = createDataProvider(fetchJson);
    await provider.getList('users', list(1, 1, { q: 'a' }));
    await provider.getList('users', list(1, 1, { q: 'b' }));
    await provider.getList('users', list(1, 2, { q: 'a' }));
    expect(calls.at(-1)?.path).toBe('/users?q=a&limit=1&cursor=qa');
    // Page 2 d'une autre taille : curseur inconnu, pas de rejeu d'un curseur d'une autre liste.
    await expect(provider.getList('users', list(5, 2, { q: 'a' }))).rejects.toThrow(
      /première page/,
    );
  });

  it('borne la taille de page à 100 (maximum de l’API)', async () => {
    const { calls, fetchJson } = fakeApi({ '/audit?limit=100': { items: [], nextCursor: null } });
    await createDataProvider(fetchJson).getList('audit', list(500, 1));
    expect(calls[0]?.path).toBe('/audit?limit=100');
  });

  it('refuse une ressource inconnue', async () => {
    const { fetchJson } = fakeApi({});
    await expect(createDataProvider(fetchJson).getList('expenses', list(10, 1))).rejects.toThrow(
      /expenses/,
    );
  });
});

describe('autres opérations', () => {
  it('getOne lit la fiche d’un compte, chemin encodé', async () => {
    const { calls, fetchJson } = fakeApi({ '/users/u%2F1': { id: 'u/1', email: 'a@b.c' } });
    const result = await createDataProvider(fetchJson).getOne('users', { id: 'u/1' });
    expect(result).toEqual({ data: { id: 'u/1', email: 'a@b.c' } });
    expect(calls).toEqual([{ path: '/users/u%2F1', method: 'GET' }]);
  });

  it('retryJob relance une tâche en échec (POST)', async () => {
    const { calls, fetchJson } = fakeApi({ '/jobs/j1/retry': undefined });
    await createDataProvider(fetchJson).retryJob('j1');
    expect(calls).toEqual([{ path: '/jobs/j1/retry', method: 'POST' }]);
  });

  it('getStats lit les statistiques agrégées', async () => {
    const stats = { generatedAt: '2026-11-05T10:00:00.000Z', users: { total: 3 } };
    const { fetchJson } = fakeApi({ '/stats': stats });
    expect(await createDataProvider(fetchJson).getStats()).toEqual(stats);
  });

  it('aucune écriture : create, update, delete sont refusés sans appel réseau', async () => {
    const { calls, fetchJson } = fakeApi({});
    const provider = createDataProvider(fetchJson);
    await expect(provider.create('users', { data: {} })).rejects.toThrow(/lecture seule/);
    await expect(
      provider.update('users', { id: 'u', data: {}, previousData: { id: 'u' } }),
    ).rejects.toThrow(/lecture seule/);
    await expect(provider.delete('users', { id: 'u' })).rejects.toThrow(/lecture seule/);
    expect(calls).toEqual([]);
  });
});
