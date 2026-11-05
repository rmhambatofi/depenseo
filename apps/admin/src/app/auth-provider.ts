// Authentification de l'application admin (ADR-044) : la connexion a lieu sur la page publique
// `/admin/login` (sans code d'administration) ; ici, on ne fait que vérifier la session par cookie
// et renvoyer vers cette page quand elle a expiré (30 min, ADR-042).
import type { AuthProvider } from 'react-admin';
import { type AdminFetch, AdminHttpError } from './admin-api';

/** Rejet compris par React-admin : redirection (URL absolue → `window.location`), sans message. */
interface AuthRedirect {
  redirectTo: string;
  message: false;
}

/* eslint-disable @typescript-eslint/only-throw-error -- React-admin attend un objet `{ redirectTo,
   message: false }` (pas une Error) pour rediriger sans notification. */
export function createAuthProvider(fetchJson: AdminFetch, loginUrl: () => string): AuthProvider {
  const redirect = (): AuthRedirect => ({ redirectTo: loginUrl(), message: false });

  async function sessionIsOpen(): Promise<boolean> {
    try {
      await fetchJson('/session');
      return true;
    } catch {
      return false;
    }
  }

  return {
    login: () => Promise.reject(new Error('Connexion par la page /admin/login')),
    async logout() {
      try {
        await fetchJson('/session', { method: 'DELETE' });
      } catch {
        // Session déjà expirée : rien à fermer.
      }
      return loginUrl();
    },
    async checkAuth() {
      if (!(await sessionIsOpen())) throw redirect();
    },
    async checkError(error: unknown) {
      // L'API admin répond 404 à tout refus (ADR-042) : distinguer « session expirée » d'une fiche
      // réellement absente en relisant la session.
      if (!(error instanceof AdminHttpError) || error.status !== 404) return;
      if (!(await sessionIsOpen())) throw redirect();
    },
    async getIdentity() {
      const session = (await fetchJson('/session')) as { userId: string };
      return { id: session.userId, fullName: 'Administrateur' };
    },
  };
}
/* eslint-enable @typescript-eslint/only-throw-error */
