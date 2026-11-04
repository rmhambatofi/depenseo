// Liste blanche des routes publiques (§8.3, ADR-018), partagée par `test/auth/public-routes.spec.ts`
// (qui la fige) et par le harnais d'isolement (qui teste toutes les autres).
export const PUBLIC_ROUTES = [
  'GET /api/v1/health',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/social',
  'POST /api/v1/auth/password-reset/request',
  'POST /api/v1/auth/password-reset/confirm',
].sort();
