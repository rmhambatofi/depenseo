// Connexion au back-office (ADR-042/044) : page publique, **aucun code d'administration** ici
// (import de `src/app` ou de React-admin interdit par ESLint ; bundle vérifié par
// `scripts/check-no-admin-code.mjs`).

export interface LoginForm {
  email: string;
  password: string;
  code: string;
}

export type LoginOutcome = 'ok' | 'refused' | 'invalid' | 'error';

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const TOTP_CODE = /^\d{6}$/;

export async function submitLogin(fetchFn: FetchFn, form: LoginForm): Promise<LoginOutcome> {
  const code = form.code.replace(/\s/g, '');
  if (!TOTP_CODE.test(code)) return 'invalid';
  try {
    const res = await fetchFn('/admin/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.trim(), password: form.password, code }),
    });
    if (res.status === 204) return 'ok';
    // Tout refus de l'API admin est un 404 indiscernable (ADR-042) ; 400 = corps refusé.
    return res.status === 404 || res.status === 400 ? 'refused' : 'error';
  } catch {
    return 'error';
  }
}
