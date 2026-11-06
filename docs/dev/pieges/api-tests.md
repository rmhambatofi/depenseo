# Pièges — API : tests (vitest, MariaDB partagée, horloges)

## Lancer les tests

- `pnpm test` exige la base (`docker compose up -d db && scripts/db-wait.sh`). **Jamais deux suites en parallèle** (voir `outils.md`).
- `pnpm --filter api test` = `vitest run --coverage` avec seuil 70 % → **un seul fichier : `pnpm --filter api exec vitest run <fichier>`**. Sous couverture, les tests lourds ralentissent ×7 : un « timed out in 5000ms » nouveau sous `pnpm test` = délai par `describe` (sauvegarde/restauration : 30 s).
- `globalSetup` **vide** `depenseo_test`, la passe en latin1 puis la remigre : un test n'attend rien d'un lancement précédent. `scripts/db.test.mjs` vérifie la collation : si vitest a été interrompu après le passage en latin1, relancer vitest une fois. Il vérifie aussi `depenseo_restore_test` (à créer à la main sur un ancien volume, commande dans BACKUP.md).
- Banc `pnpm --filter api bench` (`apps/api/bench/p95.bench.ts`, `vitest.bench.config.ts`, hors `pnpm test`) vide aussi `depenseo_test` : jamais en parallèle. Types autocannon : `.on('response')` seulement sur la forme à rappel.
- Test d'invariants (`test/support/schema-invariants.ts`) : toutes les tables sauf `__drizzle_migrations`/`zz_test_*`. Tables jetables `zz_test_*` supprimées en fin de test.

## Harnais

- `test/support/app.ts` : `startTestApp({ clock, env, idTokenKeys, storeVerifier, storeNotificationKeys })` (`env` complète `TEST_ENV` ; `{ X: undefined }` retire une variable), `http(app)`, `LogCapture`. `test/support/db.ts` : `TEST_DATABASE_URL`, `migratorConnection()`.
- `test/support/access.ts` : `createTenant(app, db, now)`, `callAs`, `problemWithoutInstance`. `test/support/users.ts` : `createUser(db, now, {verified})` (renvoie `notebookId`, sans jeton). Jobs : `test/support/jobs.ts` (`testDb`, `testJob()` à type unique, `silentLogger`), `test/support/clock.ts` (`FakeClock`, `set(epochMs)`).
- Clients par domaine dans `test/support/` : `expenses.ts`, `period-summary.ts` (`summaryClient`), `dashboard.ts`, `recurring.ts`, `push.ts` (`FakePushSender`, `insertDevice`), `subscriptions.ts`, `store-fixtures.ts` (`jws(payload, 'trusted'|'rogue')`, PKI `test/fixtures/apple-pki/generate.sh`), `local-server.ts`, `id-tokens.ts`, `admin.ts`.
- **Harnais cross-tenant** (`test/access/cross-tenant.spec.ts`) : toute nouvelle route doit y être classée (y compris `/me/*`) ; nouveau paramètre de chemin → `RESOURCE_PARAMS` `(owner, db)` / `BODIES` ; nouvelle table de carnet → étendre `notebookRows`. Il couvre seul les GET `{notebookId}`, mais le relecteur exige un test 404 explicite par ressource : le prévoir d'emblée. `ACCOUNT_ROUTES` exige l'identifiant de B dans la réponse ; sinon `ACCOUNT_ROUTES_TESTED_ELSEWHERE` + test d'isolement dédié.
- Routes publiques : liste blanche `test/support/public-routes.ts` / `test/auth/public-routes.spec.ts`, énumérée **par OpenAPI** : ne jamais `@ApiExcludeController` une route publique.
- `test/openapi.spec.ts` : nouvelle route → `pnpm --filter api openapi` ; échoue sur tout `type: number`.
- Toute nouvelle table casse `test/me/account-deletion.spec.ts` (`populated()`, `test/support/user-references.ts`) et `account-export.spec` tant que la fixture ne la remplit pas.

## Horloges et plages de dates (base partagée entre suites parallèles)

- **Chaque suite vit dans sa plage de dates** ; une suite qui lance une tâche périodique **globale** (génération, purge, `runJobs`) doit choisir une plage où elle seule a des données éligibles et n'asserter que sur ses propres identifiants. Plages prises : `tokens.spec` purge les refresh expirés avant 2025-06-01 ; `sync-purge.spec` août 2025 ; récurrences (génération, purge) mars–avril 2025 sans connexion ; échéances dues janvier 2025 (+ 31 mars 2024) ; rappels février 2025 (+ 10 mars 2024, 30–31 mars 2025, 27 octobre 2024) ; notify juin 2025 ; auth janvier 2026 ; exports février 2026 ; jauge HTTP mai 2026 (tz mars/mai/octobre 2026) ; alertes juillet–octobre 2026 ; dépense inhabituelle septembre 2026 (+ mars 2026) ; file 2026-11-04 ; tableau de bord novembre 2026 et 31 octobre 2026 23:30 UTC ; récurrences HTTP décembre 2026 ; admin décembre 2026 ; suppression de compte mai 2027 ; export RGPD juillet 2027 (purge mars 2023) ; abonnements août 2027 ; `admin-routes.spec` mars 2028 ; **`admin-stats.spec` avril 2029** (assertions exactes : aucune autre suite ne doit y créer compte, essai ou abonnement actif). Noter toute nouvelle plage ici.
- Toute connexion (`createTenant`) crée un refresh à +30 j : une suite à horloge ancienne casse le compte de `tokens.spec`. Pour les plages anciennes, comptes sans connexion (`createUser`).
- Jeton d'accès de 15 min : `clock.advance(DAY)` après `tenant()` → 401. Écrire `deleted_at` en base pour simuler l'ancienneté ; pour changer de période, bascule de minuit en < 15 min.
- Une réclamation `SKIP LOCKED` verrouille transitoirement les lignes **d'autres types** de l'index `(status, run_at)` : plage `run_at` disjointe par suite ou boucler jusqu'à épuisement (cf. `sendMails` de `test/auth/register.spec.ts`). Instabilité connue (1/5, P1-06) : `job-runner.spec.ts › écarte la clôture tardive…` expire quand une autre suite réclame dans sa plage (2026-11-04) ; correction possible : plage propre ou boucle du `runJobs` interne.
- `auditOf` trie par `created_at` : horloge avancée puis reculée → lignes « futures » ; asserter par `toContain`, pas `.at(-1)`.
- Suite qui compare l'état de `depenseo_test` pendant que d'autres écrivent : relire **dans le même instantané** (hook `afterDump`) et exclure les `zz_test_*`.

## Concurrence et verrous

- Barrière de verrou : sonder `information_schema.PROCESSLIST` (connexions du même compte) sur le texte de la requête en attente, **avec `ID <> CONNECTION_ID()`** (sinon la sonde se trouve elle-même) ; toujours `expect(waiting).toBe(true)` après la boucle (cf. `password-reset.spec.ts`). Pas de `sleep`.

## Écriture des tests

- Refus de clé inconnue (zod strict) : tester **avec un champ valide en plus** (sinon la règle « au moins un champ » refuse déjà).
- Pagination : une ligne insérée à la même date avec un id v7 plus grand se classe *avant* le curseur.
- Liste avec paramètre répété : `list(t, query)`, pas `.query()` de supertest (`a[0]=`).
- Supertest, corps binaire : `.buffer(true).parse(binary)` (voir `test/exports/exports.spec.ts`).
- Limitation de débit : `TEST_ENV` neutralise les seuils ; adresses distinctes → `TRUST_PROXY_HOPS: '1'` + `X-Forwarded-For`.
- CryptoKey WebCrypto (jose `generateKeyPair`) liée à son hash : pour plusieurs `alg` avec une même clé RSA, `generateKeyPairSync('rsa')`.
- Absence d'un montant dans une réponse : chercher la valeur **entière ou formatée** (`/987654|9876[.,]54/`), jamais un fragment court (« 987 » apparaît au hasard dans les UUID : CI rouge du 2026-11-06).
