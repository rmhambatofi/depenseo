# PROGRESS — journal de passation entre sessions

Ce fichier est le **seul** état transmis d'une session Claude Code à la suivante. Tiens-le court : la session suivante le lit en premier et ne doit pas avoir à relire tout le dépôt.
Garde au plus 10 entrées dans l'historique ; résume les plus anciennes.

## État courant

- Tâche en cours : aucune
- Prochaine tâche : P1-06 (connexion JWT 15 min, refresh opaque haché avec rotation et détection de réutilisation)
- Dernier commit : feat(api): email/password registration with argon2id and single-use email verification (P1-05)
- Branche : main
- Tests : `pnpm -r typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` verts (9 tests scripts/, 134 vitest shared, 107 vitest api), `pnpm test:tz` vert (shared 50 + api 14 sous chacun des 4 TZ)

## Pièges connus (à lire avant de coder)

- Versions relevées le 2026-11-04 : Node **v26.10.0** local (cible 22, voir ADR-006 ; pas de nvm/fnm/volta, `n` présent dans /usr/local/bin), pnpm 9.15.4, Docker Compose v5.1.0, Flutter 3.47.6 / Dart 3.13.5, git 2.45.2.
- Le démon Docker peut être arrêté : lancer Docker Desktop (`open -a Docker`) avant tout `pnpm test` (moteur 29.3.0).
- Sous-agents lancés en arrière-plan : attendre la notification (ne jamais lire leur fichier .output). Le hook Stop bloque toute fin de tour avec diff non committé : lancer tester/reviewer en **premier plan** (`run_in_background: false`) pour éviter des tours d'attente.
- TypeScript épinglé à **6.0.3** : typescript-eslint 8.72 exige `typescript <6.1.0` (TS 7 natif non supporté). Ne pas monter TS sans vérifier le peer.
- `pnpm -r lint` n'inclut pas la racine : `pnpm lint` (racine) lint aussi `scripts/` ; `pnpm test` (racine) lance `node --test scripts/*.test.mjs` puis les tests des paquets.
- Règle `no-restricted-syntax` (eslint.config.mjs) : rejette `new Date(…)` et `Date.parse(…)` sur AAAA, AAAA-MM ou AAAA-MM-JJ, en littéral ou en gabarit sans expression ; les fixtures `scripts/lint-fixtures/` sont ignorées sauf par le test.
- Le plan a été renuméroté le 2026-11-04 (session d'amorçage) : se fier aux IDs actuels de PLAN.md et à TRACEABILITY.md.
- `pnpm test` exige la base : `docker compose up -d db && scripts/db-wait.sh` (ADR-010). Volume neuf : `docker compose down -v`.
- Base locale volontairement « hostile » : fuseau SYSTEM = Europe/Paris, REPEATABLE-READ, pas de forçage du charset client. P1-02 doit forcer `+00:00`, READ COMMITTED et la collation utf8mb4_unicode_520_ci côté mysql2 (ne pas « corriger » le cnf).
- Comptes : `depenseo_api`/`depenseo_admin` (DML seul, pas de TRUNCATE/DDL), `depenseo_migrator` (tout) sur `depenseo` et `depenseo_test` ; mots de passe dev `<compte>_dev` sauf root `depenseo_root_dev`. Nettoyer les tests avec le compte migrator.
- Image épinglée `mariadb:10.6.28` ; la version réelle d'o2switch (`SELECT VERSION()`) reste à relever par l'humain.
- CI : actions épinglées par SHA (checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.1, flutter-action v2.23.0) ; `pnpm lint:ci` = actionlint 1.7.12 via Docker. Ne pas pousser sans accord humain (dépôt public). Vérifier les entrées d'une action sur son README à la version épinglée (`gh api repos/<o>/<r>/contents/README.md?ref=<tag>`, URL entre guillemets sous zsh).
- `packages/shared` (P0-04, ADR-011) : `Cents`, `CurrencyCode`, `CalendarDate` (brands), `formatAmount` (chaîne décimale exacte vers Intl), `parseAmountInput` → `{ok,cents}|{ok:false,error}`. Décimales par devise = table ISO 4217 figée dans `currency.ts`, jamais Intl/ICU. Écrire les espaces insécables en `\u00a0`/`\u202f` dans le source (sinon `no-irregular-whitespace`) : un heredoc ou un éditeur peut les écrire littéralement, vérifier.
- `packages/shared/src/period.ts` (P0-05, ADR-012) : `periodContaining/nextPeriod/previousPeriod` (règle `{kind:'month',startDay 1–31}` repli fin de mois, `{kind:'week',startDay? ISO 1–7}`), `todayIn(tz, Temporal.Instant)`, `toPlainDate/toCalendarDate`. Importer `Temporal` depuis `temporal-polyfill` (1.0.7), jamais le global (Node 26 l'a, Node 22 non). Convention : suites multi-fuseaux nommées `*.tz.test.ts`, lancées par `test:tz` de chaque paquet (racine : `pnpm test:tz`) ; l'API devra fournir son propre `test:tz`.
- `apps/api` (P1-01, ADR-013) : NestJS **12** ESM, `createApp(config, {logDestination})` dans `src/app.ts` (partagé main/tests/openapi), `test/support/app.ts` (`startTestApp`, `http(app)` pour supertest typé, `LogCapture`). Nouvelle variable d'env → schéma zod `src/config/env.ts`. Nouvelle route → `pnpm --filter api openapi` sinon `test/openapi.spec.ts` échoue (fichier exclu de Prettier). `detail` client uniquement via `ProblemException`. Vitest émet les métadonnées de décorateurs sans SWC.
- `pnpm --filter api …` résout `@depenseo/api` (portée omise).
- Couche données (P1-02, ADR-014) : `src/db/connection.ts` (`createDbPool(config, hooks)` pool **à rappels** mysql2, `createDatabase(pool)` → `drizzle(pool)` positionnel : `drizzle({client, mode})` casse en 0.45.4), `transaction.ts` (`withTransaction(db, fn)` sur le client racine seulement), `uuid.ts` (`newId`, `uuidToBinary`, `binaryToUuid`, colonne `uuidBinary`), `DatabaseModule` global (jetons `DB`, `DB_POOL`). Config : `DATABASE_URL` (obligatoire), `DB_POOL_SIZE`. Tests : `test/support/db.ts` (`TEST_DATABASE_URL`, `migratorConnection()`) ; tables jetables `zz_test_*` supprimées en fin de test (ignorées par le test d'invariants).
- `session.tz.spec.ts` lit `@@session.tx_isolation` (MariaDB seulement ; MySQL 8 : `@@transaction_isolation`). BIGINT montants : `bigint(…, { mode: 'number' })` + rejet des chaînes (ADR-015).
- `DrizzleQueryError` met requête **et paramètres** dans son message (multiligne) : ne jamais journaliser `error.message` ; `describeError` le retire et remonte `code`/`errno` de la `cause`.
- Sous-agent `tester` : vérifie déjà la stabilité des tests de verrous en les relançant 3 fois ; garder les tests d'interblocage avec barrière explicite (pas de `sleep`).
- Vérifier qu'un test mord par contre-épreuve (mutation rapide du code puis restauration) : la relecture de P1-01 a trouvé un test de journal qui passait sans que la redaction serve.
- **Avant le premier import de `@depenseo/shared` dans l'API** (toujours pas fait après P1-04) : `@depenseo/shared` exporte du `.ts` (`main: ./src/index.ts`) ; le `dist` de l'API (tsc → `node dist/src/main.js`) cassera dès son premier import. Compiler `shared` (build + `exports` vers `dist`) ou équivalent.
- Les remplacements par script échouent silencieusement après un passage de Prettier (tableaux reformatés) : toujours `grep` le résultat.
- Migrations (P1-03, ADR-015) : schéma `src/db/schema/*.ts` → `pnpm --filter api db:generate` (drizzle-kit) → `apps/api/drizzle/NNNN_*.sql` committé ; appliquer par `runMigrations(url)` / `MIGRATOR_DATABASE_URL=… pnpm --filter api migrate`. Ne jamais modifier une migration appliquée. Pas de colonne JSON (utf8mb4_bin sous MariaDB) ni `binary()` Drizzle (décode en UTF-8 : utiliser `sha256Binary`/`uuidBinary`). Horodatages fournis par l'app.
- `vitest` a un `globalSetup` qui **vide** `depenseo_test`, la passe en latin1 puis la remigre : un test ne doit rien attendre d'un lancement précédent. Le test d'invariants (`test/support/schema-invariants.ts`) parcourt toutes les tables sauf `__drizzle_migrations`/`zz_test_*` ; règles par nom (`*_id`, `*amount*`, `*currency`, `*rate`) — un identifiant externe ne doit pas finir en `_id`.
- `scripts/db.test.mjs` (node --test, lancé avant vitest) vérifie la collation de `depenseo_test` : si un lancement vitest est interrompu après le passage en latin1, relancer vitest une fois.
- File de tâches (P1-04, ADR-016) : `JobQueue(clock).enqueue(tx, defineJob(type, zod), payload, {runAt, uniqueKey})` ; charge utile = identifiants seuls (clés sensibles et chaînes `x@y` refusées, ≤ 4 Kio). Gestionnaires et tâches périodiques à déclarer dans `src/jobs/registry.ts` ; `runJobs` ne réclame que les types enregistrés. Gestionnaires idempotents, à l'écoute de `context.signal`. Tests : `test/support/jobs.ts` (`testDb`, `testJob()` à type unique par test, `silentLogger`), `test/support/clock.ts` (`FakeClock`). Horloge applicative : `src/clock.ts` (`Clock`, `systemClock`).
- Ne **jamais** combiner `OR` + `ORDER BY` dans une requête `FOR UPDATE SKIP LOCKED` : MariaDB trie hors index et verrouille toutes les lignes candidates (constaté). Vérifier le plan par EXPLAIN (`ref`/`range` sans filesort).
- Un client Drizzle sur le pool ne doit pas être utilisé pendant qu'on tient une connexion dédiée (`GET_LOCK`) : avec `DB_POOL_SIZE=1`, interblocage. Utiliser `drizzle(poolConnection.connection)`.
- mysql2 active `CLIENT_FOUND_ROWS` : `affectedRows` compte les lignes **trouvées** (ON DUPLICATE KEY sans changement → 1). Ne pas s'en servir pour distinguer insertion et doublon.
- `sed`/remplacements Python sur un fichier déjà passé par Prettier : les imports longs sont reformatés, vérifier par `grep` (encore piégé en P1-04).
- Auth (P1-05, ADR-017) : `AuthService` (`src/auth/`) : `register` (202 toujours, réinscription d'un compte non vérifié = remplacement du mot de passe), `verifyEmail` (UPDATE conditionnel + `affectedRows`), `authenticate(email, pwd)` → 401/403 **à réutiliser en P1-06** pour la route de connexion. Horloge Nest : `@Inject(CLOCK)`, tests `startTestApp({ clock })`. Corps validés par `parseBody(zodSchema, body)` (`src/http/parse-body.ts`). Le cron exige `SMTP_URL`, `MAIL_FROM`, `PUBLIC_WEB_URL` (`loadMailConfig`) ; `jobHandlers(deps)` prend désormais ses dépendances.
- Clés de charge utile de tâche : `SENSITIVE_KEY` refuse toute clé contenant `token`, `password`, `mail`… (ex. `tokenId` interdit) : nommer autrement (`userId`, `requestId`).
- Suites qui exécutent `runJobs` en parallèle : une réclamation `SKIP LOCKED` verrouille transitoirement les lignes **d'autres types** parcourues dans l'index `(status, run_at)`, qu'un autre worker saute alors. Donner à chaque suite une plage `run_at` disjointe (auth : janvier 2026, file : 2026-11-04) ou boucler jusqu'à épuisement (cf. `sendMails` dans `test/auth/register.spec.ts`). En production, effet bénin (traité au passage suivant).
- `@node-rs/argon2` : `Algorithm` est un `const enum` ambiant (inutilisable en valeur sous `isolatedModules`) : `2 as Algorithm.Argon2id`. Paquets nodemailer 10 : sources dans `dist/esm`, pas `lib/`.

## Actions humaines (non bloquantes)

- Pousser `main` vers `origin` (dépôt **public**, rien n'a été poussé depuis 5+ commits), puis noter ici le résultat du premier run CI (critère P0-03).
- Relever `SELECT VERSION()` sur o2switch et ajuster l'image `mariadb:10.6.28` si besoin.

## BLOQUÉ

(rien)

## Historique (plus récent en haut)

- 2026-11-04 session 6 — P1-05 fait : inscription (argon2id, 202 sans énumération, remplacement du mot de passe d'un compte non vérifié contre la pré-inscription), lien de vérification 24 h tiré par le gestionnaire `mail.verify_email` (≤ 3/h), `verify-email` usage unique sous concurrence, `Mailer` (SMTP nodemailer 15 s + faux mémoire), `authenticate` 401/403 ; ADR-017. Deux relectures (1 bloquant corrigé : pré-détournement). Contre-épreuves faites.

- 2026-11-04 session 5 — P1-04 fait : file `job` (enqueue transactionnel, unicité, garde PII), `runJobs` (réclamation SKIP LOCKED en deux requêtes, bail 5 min, garde de clôture, délai gestionnaire, 1-2-4-8 min puis `failed`), planification sous `GET_LOCK` + purge par lots, `scripts/jobs-run.ts`, migration `0001_job_claim_indexes` ; ADR-016. Deux relectures (1 bloquant corrigé : verrouillage de toutes les lignes dues). Contre-épreuves faites (skipLocked, garde attempts). Passation après 1 tâche (~15 fichiers lus).

- 2026-11-04 session 4 — P1-03 fait : 7 tables du socle (user, notebook, notebook_member, refresh_token, email_token, audit_log, job), migration drizzle-kit + `ALTER DATABASE` de collation, `runMigrations` sous `GET_LOCK`, test d'invariants information_schema avec contre-épreuve (table fautive) ; ADR-015. Passation après 1 tâche (~13 fichiers lus, P1-04 volumineuse).

- 2026-11-04 session 3 — P1-02 fait : pool mysql2 réglé par connexion (+00:00, READ COMMITTED, utf8mb4_unicode_520_ci, échec → connexion détruite), `withTransaction` (1213/1205, interblocage réel testé), UUID v7 ↔ BINARY(16), `describeError` durci contre les messages Drizzle multilignes. Contre-épreuve faite (retrait des SET / du retry → tests rouges). Passation après 1 tâche (seuil de ~15 fichiers lus).

- 2026-11-04 — Session 2 : P0-05 (périodes + todayIn, ADR-012, coverage-v8 ajouté), P1-01 (squelette API, ADR-013).

- 2026-11-04 — Session 1 : P0-02 (MariaDB compose, ADR-010), P0-03 (CI, run GitHub en attente de push humain), P0-04 (shared montants/dates, ADR-011) ; handoff après 3 tâches.

- 2026-11-04 — Session d'amorçage : plan affiné (60 tâches, renumérotées), `TRACEABILITY.md`, ADR-003 à 009 ; P0-01 faite (monorepo pnpm, TS strict, ESLint + règle dates, Prettier).

- 2026-11-04 — Initialisation du kit : CLAUDE.md, PLAN.md, hooks, agents. Aucun code applicatif encore.
