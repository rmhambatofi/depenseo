import { describe, expect, it } from 'vitest';
import { type AdminFetch, AdminHttpError } from './admin-api';
import { createAuthProvider } from './auth-provider';

const LOGIN = 'https://admin.test/admin/login';

function fakeApi(sessionOpen: boolean) {
  const calls: string[] = [];
  const fetchJson: AdminFetch = (path, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${path}`);
    if (path === '/session' && sessionOpen) {
      return Promise.resolve(
        init.method === 'DELETE' ? undefined : { userId: 'u1', expiresAt: '2026-11-05T10:30:00Z' },
      );
    }
    return Promise.reject(new AdminHttpError(404));
  };
  return { calls, fetchJson };
}

describe('authProvider', () => {
  it('checkAuth : session ouverte → accepté ; sinon redirection vers la page de connexion', async () => {
    await expect(
      createAuthProvider(fakeApi(true).fetchJson, () => LOGIN).checkAuth({}),
    ).resolves.toBeUndefined();
    await expect(
      createAuthProvider(fakeApi(false).fetchJson, () => LOGIN).checkAuth({}),
    ).rejects.toEqual({
      redirectTo: LOGIN,
      message: false,
    });
  });

  it('checkError : un 404 avec session encore valide (fiche absente) ne déconnecte pas', async () => {
    const open = fakeApi(true);
    await expect(
      createAuthProvider(open.fetchJson, () => LOGIN).checkError(new AdminHttpError(404)),
    ).resolves.toBeUndefined();
    expect(open.calls).toEqual(['GET /session']);
    await expect(
      createAuthProvider(fakeApi(false).fetchJson, () => LOGIN).checkError(new AdminHttpError(404)),
    ).rejects.toEqual({ redirectTo: LOGIN, message: false });
  });

  it('checkError : une autre erreur (500) ne déconnecte pas et n’appelle rien', async () => {
    const api = fakeApi(false);
    await expect(
      createAuthProvider(api.fetchJson, () => LOGIN).checkError(new AdminHttpError(500)),
    ).resolves.toBeUndefined();
    expect(api.calls).toEqual([]);
  });

  it('logout : ferme la session puis renvoie vers la page de connexion, même déjà expirée', async () => {
    const open = fakeApi(true);
    await expect(createAuthProvider(open.fetchJson, () => LOGIN).logout({})).resolves.toBe(LOGIN);
    expect(open.calls).toEqual(['DELETE /session']);
    await expect(
      createAuthProvider(fakeApi(false).fetchJson, () => LOGIN).logout({}),
    ).resolves.toBe(LOGIN);
  });

  it('getIdentity : identifiant du compte admin connecté', async () => {
    const identity = await createAuthProvider(fakeApi(true).fetchJson, () => LOGIN).getIdentity!();
    expect(identity).toEqual({ id: 'u1', fullName: 'Administrateur' });
  });

  it('login : jamais par l’application (page /admin/login séparée)', async () => {
    await expect(
      createAuthProvider(fakeApi(true).fetchJson, () => LOGIN).login({}),
    ).rejects.toThrow();
  });
});
