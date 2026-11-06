# Pièges — back-office (API admin et `apps/admin`)

## API admin (ADR-042, ADR-043)

- `src/admin/` — API admin sous **`/admin/api/*`** (hors préfixe `/api/v1`, exclusion `admin{/*rest}` dans `app.ts` ; Nest monte alors un attrape-tout `/admin{/*rest}` → 404). Nouveau contrôleur = `@AdminController('chemin')` (garde `AdminGuard` : cookie `depenseo_admin` + rôle + empreinte d'enrôlement relus à chaque requête, 404 sinon, ligne `admin.access` ; exclu de l'OpenAPI). `@CurrentAdmin()` → `{userId}`.
- Audit : `recordAdminAudit` (`admin-audit.ts`) avec `targetType/targetId` pour chaque compte consulté (`admin.user_view`, `admin.job_retry`). Routes : `admin-routes.controller.ts` (`users`, `subscriptions`, `jobs` + `POST jobs/:jobId/retry`, `stats`, `audit`), services `admin-users.service.ts`/`admin-ops.service.ts`, paramètres `admin-query.ts` (curseur `(created_at, id)` décroissant, `toPage`).
- Exclusion de préfixe Nest 12 : syntaxe path-to-regexp v8 (`admin{/*rest}` couvre `/admin` et `/admin/…` ; `admin/{*rest}` laisse `/admin` au 404 HTML d'Express). Hors des deux préfixes, Express répond un 404 **HTML**.
- Express ignore la casse des routes : toute garde qui teste un chemin doit l'ignorer aussi (`isAdminPath`).
- Env `ADMIN_SESSION_SECRET`/`ADMIN_TOTP_KEY` (dans `TEST_ENV`). Script `pnpm --filter api admin:grant <email>` (refuse sans terminal).

## Tests API admin

- Harnais `test/admin/admin-access.spec.ts` : énumère les routes Express montées (`app.getHttpAdapter().getInstance().router.stack`, chemins avec `*` ignorés) et vérifie le 404 sans session (`:param` remplacé automatiquement).
- `test/support/admin.ts` : `createAdmin(db, now)`, `adminLogin`, `codeAt`, `sessionCookie`, `auditOf`, `ADMIN_DIST_FIXTURE`, `PUBLIC_ADMIN_ROUTES`, `ADMIN_CONSOLE_ROUTES`. Plages : décembre 2026, mars 2028, avril 2029 (voir `api-tests.md`).

## Console web `apps/admin` (ADR-044)

- Deux builds Vite : `vite.login.config.ts` → `dist/login` (TS sans framework, imports de `src/app`/React interdits par ESLint) ; `vite.config.ts` → `dist/app` (React-admin 5.15.5, routeur `#/`). Listes sur `SERVER_SORT` (tout autre tri refusé par le fournisseur).
- Servis par `AdminConsoleController` depuis `ADMIN_DIST_DIR`, chargé en mémoire au démarrage : recompiler l'admin puis **redémarrer** l'API. Fixture API : `test/fixtures/admin-dist`.
- E2E : `pnpm --filter @depenseo/admin test:e2e` (build admin + `build:e2e` de l'API → `apps/api/dist-e2e`, port 3100 sur `depenseo_test`) : **jamais en parallèle de Vitest**. Chromium Playwright dans `~/Library/Caches/ms-playwright`. Sélecteurs `getByRole('heading', { exact: true })`. `check:admin-code` exige le build admin (sentinelle `depenseo-admin-app` = en-tête `X-Depenseo-Client`).

## Reliquats mineurs

- P5-03 : pas de test de concurrence du plafond d'échecs TOTP ; compte de base `depenseo_admin` non branché (écart ADR-044, `DEPLOY.md` §2).
- P5-04 : test de liste des tâches cherche sa ligne dans les 100 premiers échecs ; fiche inexistante non tracée avec l'id ; tris sans index (`user.created_at`, `job.created_at`).
- P5-05 : bundle ~1 Mo non découpé ; e2e non-admin sans session web (couvert côté API).
