import { describe, expect, it } from 'vitest';
import { createApiClient } from './index.js';

const NOTEBOOK = '01934f6e-0000-7000-8000-000000000001';
const EXPENSE = '01934f6e-0000-7000-8000-000000000002';

function recorder(body: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = (request: Request): Promise<Response> => {
    requests.push(request);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { requests, fetch };
}

describe('createApiClient', () => {
  it('appelle les chemins /api/v1 du contrat sous la base donnée', async () => {
    const { requests, fetch } = recorder({ status: 'ok' });
    const api = createApiClient({ baseUrl: 'https://depenseo.example/', fetch });

    const { data, error } = await api.GET('/api/v1/health');

    expect(error).toBeUndefined();
    expect(data).toEqual({ status: 'ok' });
    expect(requests[0]?.url).toBe('https://depenseo.example/api/v1/health');
    expect(requests[0]?.headers.get('authorization')).toBeNull();
  });

  it('substitue les paramètres de chemin et joint le jeton d’accès courant', async () => {
    const { requests, fetch } = recorder({});
    let token = 'jeton-1';
    const api = createApiClient({
      baseUrl: 'https://depenseo.example',
      fetch,
      accessToken: () => Promise.resolve(token),
    });
    const params = { path: { notebookId: NOTEBOOK, expenseId: EXPENSE } };

    await api.GET('/api/v1/notebooks/{notebookId}/expenses/{expenseId}', { params });
    token = 'jeton-2';
    await api.GET('/api/v1/notebooks/{notebookId}/expenses/{expenseId}', { params });

    expect(requests[0]?.url).toBe(
      `https://depenseo.example/api/v1/notebooks/${NOTEBOOK}/expenses/${EXPENSE}`,
    );
    expect(requests.map((r) => r.headers.get('authorization'))).toEqual([
      'Bearer jeton-1',
      'Bearer jeton-2',
    ]);
  });

  it('n’envoie pas d’en-tête quand aucun jeton n’est disponible', async () => {
    const { requests, fetch } = recorder({});
    const api = createApiClient({
      baseUrl: 'https://depenseo.example',
      fetch,
      accessToken: () => undefined,
    });

    await api.GET('/api/v1/health');

    expect(requests[0]?.headers.get('authorization')).toBeNull();
  });

  it('expose le corps d’erreur sans lever d’exception', async () => {
    const { fetch } = recorder({ statusCode: 404, message: 'Not Found' }, 404);
    const api = createApiClient({ baseUrl: 'https://depenseo.example', fetch });

    const { data, error, response } = await api.GET('/api/v1/notebooks/{notebookId}', {
      params: { path: { notebookId: NOTEBOOK } },
    });

    expect(data).toBeUndefined();
    expect(response.status).toBe(404);
    expect(error).toEqual({ statusCode: 404, message: 'Not Found' });
  });
});
