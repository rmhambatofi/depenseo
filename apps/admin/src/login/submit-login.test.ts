import { describe, expect, it } from 'vitest';
import { submitLogin } from './submit-login';

function fakeFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(null, { status }));
  };
  return { calls, fetchFn };
}

const form = { email: ' Admin@Depenseo.app ', password: 'mot de passe', code: '123 456' };

describe('submitLogin', () => {
  it('envoie les identifiants à /admin/api/session (code sans espaces) et réussit sur 204', async () => {
    const { calls, fetchFn } = fakeFetch(204);
    expect(await submitLogin(fetchFn, form)).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/admin/api/session');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.credentials).toBe('same-origin');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: 'Admin@Depenseo.app',
      password: 'mot de passe',
      code: '123456',
    });
  });

  it('refus indiscernable (404, 400) → « refused » ; autre statut → « error »', async () => {
    expect(await submitLogin(fakeFetch(404).fetchFn, form)).toBe('refused');
    expect(await submitLogin(fakeFetch(400).fetchFn, form)).toBe('refused');
    expect(await submitLogin(fakeFetch(503).fetchFn, form)).toBe('error');
  });

  it('réseau coupé → « error »', async () => {
    const failing = () => Promise.reject(new TypeError('fetch failed'));
    expect(await submitLogin(failing, form)).toBe('error');
  });

  it('code mal formé : refusé sans appel réseau', async () => {
    const { calls, fetchFn } = fakeFetch(204);
    expect(await submitLogin(fetchFn, { ...form, code: '12a456' })).toBe('invalid');
    expect(await submitLogin(fetchFn, { ...form, code: '12345' })).toBe('invalid');
    expect(calls).toEqual([]);
  });
});
