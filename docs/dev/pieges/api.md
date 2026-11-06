# Pièges — API : conventions et modules

Repères par module (où est quoi, quoi réutiliser). Base et migrations : `api-db.md` ; tests : `api-tests.md`.

## Conventions transverses

- NestJS **12** ESM, `createApp(config, {logDestination})` dans `src/app.ts` (partagé main/tests/openapi). Nouvelle variable d'env → schéma zod `src/config/env.ts` (`databaseUrl`/`aes256Key` exportés). `detail` client uniquement via `ProblemException`. Vitest émet les métadonnées de décorateurs sans SWC.
- Corps : `parseBody(zodSchema, body)` (`src/http/parse-body.ts`, remplace `undefined` par `{}` : pas pour un paramètre de requête facultatif). Requête : `parseQuery(schema, req.query)` (`src/http/parse-query.ts`, objet strict) **pour tout paramètre de requête**. UUID : `src/http/uuid-schemas.ts`. zod 4 : `z.uuid()` exige une variante RFC 4122 → `z.guid()` pour un identifiant externe quelconque.
- **OpenAPI** : tout entier porte `type: 'integer'` ; `@ApiParam({ name, format: 'uuid' })` sur tout paramètre de chemin. Après toute modif de contrat : `pnpm --filter api openapi` régénère `openapi.json` **et** `packages/api-client/src/schema.ts` (ADR-045), committer les deux (fichier exclu de Prettier).
- **Garde globale** `AccessTokenGuard` : toute route est protégée ; `@Public()` **sur la méthode** + liste blanche des routes publiques. `@CurrentUser()` → `{ userId }`. Horloge : `@Inject(CLOCK)` (`src/clock.ts`).
- **Routes de carnet** : `/notebooks/:notebookId/…` + `@UseGuards(NotebookAccessGuard)` + `@CurrentNotebook()` → `{notebookId, role}` ; **filtrer les ressources filles par `notebook_id`** dans la requête. Écritures sous `lockNotebook(tx, id)` (`src/notebooks/notebook-lock.ts`).
- Fuseau : **toujours** `normalizeTimeZone` de `@depenseo/shared` ; jamais `Intl…resolvedOptions().timeZone` (`America/Montreal` → `America/Toronto`). Lire `user.time_zone` pour tout calcul de période.
- **Limitation de débit** (ADR-062, ADR-067) : `@RateLimited({ perAccount })` (`src/rate-limit/`) sur toute route d'authentification publique (sauf refresh/logout). Seaux HMAC ; `rate_limit` est dans `UNLINKED_TABLES` avec clé naturelle (`NATURAL_PRIMARY_KEYS`) : ne pas imiter pour une table de données. `TRUST_PROXY_HOPS` obligatoire en production.
- En-têtes de sécurité : `src/http/security-headers.ts` sur toute réponse ; une page HTML servie par l'API pose sa propre CSP (comme `CONSOLE_CSP`).
- `@depenseo/shared` compilé (ADR-022) : `exports` types→`src`, default→`dist` ; Vitest aliase les sources, mais Node (`start`, `jobs:run`, scripts) lit `dist` : recompiler après toute modif de `shared`.
- **Sentry** (ADR-064) : `src/observability/sentry.ts`, `initSentry` dans `main.ts` seulement, `scrubEvent` par **listes blanches**, 5xx via `ProblemDetailsFilter(reportError)`. DSN région UE imposé. `@sentry/node` 11 : `sendDefaultPii` → `dataCollection`. Nouvelle intégration Sentry = relecture NF-SEC-06.
- Performance (ADR-065) : `GET …/sync?updated_since=<trop ancien>` → **410** (synchro complète = sans `updated_since`).

## File de tâches et cron (ADR-016)

- `JobQueue(clock).enqueue(tx, defineJob(type, zod), payload, {runAt, uniqueKey})` ; charge utile = identifiants seuls (≤ 4 Kio, chaînes `x@y` refusées). `SENSITIVE_KEY` refuse toute clé contenant `token`, `password`, `mail`… (nommer `userId`, `requestId`).
- Gestionnaires et tâches périodiques déclarés dans `src/jobs/registry.ts` (`jobHandlers(deps)`) ; idempotents, à l'écoute de `context.signal`. `runScheduledTasks` isole chaque tâche (`failures`, sortie 1) ; détails journalisables : `ScheduledTaskError(message, details)` (`describeError` ne garde pas le message).
- Cron : exige `SMTP_URL`, `MAIL_FROM`, `PUBLIC_WEB_URL` (`loadMailConfig`).

## Auth (ADR-017 à 020)

- `AuthService` (`register` 202 toujours, `verifyEmail`, `authenticate` → 401/403). `SessionService` (`login/refresh/logout`, `openSession(tx, userId, now)`), `AccessTokens` (jose HS256). `opaque-token.ts` (`generateOpaqueToken`, `hashOpaqueToken`). `AuthModule` est **global**.
- `PasswordResetService` + `scheduleThrottledMail` (`src/auth/mail-throttle.ts`) : l'appelant **doit** tenir un verrou exclusif sur la ligne `user`.
- `POST /auth/social` : `IdTokenVerifier` (jeton `ID_TOKEN_VERIFIER`), table `user_identity` (SHA-256 du `sub`). `APPLE_CLIENT_IDS`/`GOOGLE_CLIENT_IDS` vides = 503.
- `@node-rs/argon2` : `Algorithm` est un `const enum` ambiant → `2 as Algorithm.Argon2id`. nodemailer 10 : sources dans `dist/esm`.

## Domaine

- Carnets (ADR-021) : `createPersonalNotebook(tx, {userId, language, now})` dans `register` et `resolve`.
- Profil (ADR-022) : `PATCH /me` = `profilePatchSchema` strict (`src/me/profile.ts`) ; devises `SUPPORTED_CURRENCIES`/`isCurrencyCode`.
- Catégories (ADR-023) : `CategoriesService`, plan `default-plan.ts` copié par `seedDefaultCategories` (langue du compte, figée). Corps `category-input.ts`. Supprimer une catégorie utilisée par une récurrence active → 409.
- Dépenses (ADR-024, 025) : `ExpensesService` (exporté par `ExpensesModule`), corps `expense-input.ts` (montant 1…99 999 999 999, NFC). Recherche `GET …/expenses` → `{items, nextCursor}` (`expense-query.ts`, curseur base64url `date~id`) ; étiquettes par lot `tagsOf(tx, ids)`, `tagNamesByExpense` (`src/expenses/expense-tags.ts`).
- Sync (ADR-026) : `src/sync/`, tables de `SYNC_TABLES` (catégories → étiquettes → dépenses, puis `limits`, `recurringExpenses`, `occurrences`) par (updated_at, id), curseur `v1~table~…` ; 410 si `updated_since` > 29 j. Purge `purge-deleted-sync-rows`. Pas d'instantané commun aux pages (le client tolère une catégorie pendante).
- Limites (ADR-027) : `spending_limit` = versions datées (date d'effet = aujourd'hui serveur, fuseau du compte ; `amount` NULL = aucune limite). `withAppliesFrom`/`versionInForce` (`src/limits/limit-history.ts`), `globalLimitVersions`. PATCH = version du jour seulement.
- Jauge et périodes (ADR-028) : `periodSlices`/`summarize`/`sliceScope` (`src/limits/period-summary.ts`) **à réutiliser pour toute somme par période** ; `dayTotals` (`day-totals.ts`) ; `PeriodSummaryService`.
- Alertes (ADR-029, 030) : `checkLimitAlert(tx, clock, notebookId, userId)` en fin de create/update/restore de dépense ; `checkUnusualExpense` à la **création** seulement (jamais pour une dépense de récurrence). Job `NOTIFY` (`src/notifications/notify-job.ts`) = union discriminée par `kind` (5 kinds : à étendre plutôt que créer un type ; le gestionnaire les traite tous) ; clés préfixées par type (`unusual:<id>`, `occurrence-due:<id>`, `occurrence-reminder:<id>:J-3|J`, `daily-reminder:<compte>:<jour>`).
- Tableau de bord (ADR-031) : `GET …/dashboard` (`src/dashboard/`, `cumulativeByDay`/`categoryBreakdown`, `upcoming` via `pendingOccurrences`). Tout nouveau total affiché par le mobile s'ajoute ici.
- Récurrences (ADR-032, 033) : `src/recurring/` — `schedule.ts` (départ + n × pas, jamais chaîné), `generateOccurrences` + tâche `generate-occurrences` (horizon 40 j, `9999-12-31` = épuisée), `OccurrencesService` (`adjust`/`pay`/`skip`), `payOccurrence`/`findOccurrence`, tâche `process-due-occurrences` (due dans le fuseau du **propriétaire**).
- Rappels (ADR-034) : `src/notifications/reminder-time.ts` (`localInstant` désambiguïsation `compatible`), tâches `schedule-occurrence-reminders`, `schedule-daily-reminders`.
- Push (ADR-035) : `PushSender` (`push-sender.ts`) ; `notify` vérifie pertinence → type → plage de silence à l'envoi ; APNs/FCM facultatifs par env. Jeton OAuth Google commun : `src/google/service-account-token.ts`.
- Exports (ADR-036) : `src/exports/`, `EncryptedFileStore` (`file-store.ts`, AES-256-GCM, id en AAD ; `FILE_STORAGE_DIR` + `FILE_ENCRYPTION_KEY`), `FILE_STORE` exporté par `ExportsModule`. `decimalAmount` dans `@depenseo/shared`.
- Suppression de compte (ADR-037) : `deleteAccount(tx, userId, files)` (`src/me/account-deletion.ts`) efface aussi les fichiers d'export ; `purgeNotebook` purge `spending_limit`.
- Export RGPD (ADR-038) : `src/account-export/`, périmètre `SOURCES` (`personal-data.ts`), `EXCLUDED_TABLES`, `OMITTED_PROPERTIES` ; colonne binaire non prévue → la génération lève.
- Sauvegardes (ADR-039) : `src/backup/` (`db-dump.ts` `WITH CONSISTENT SNAPSHOT`, `sqlLiteral` strict ; `db-restore.ts` base vide seulement ; `backup-files.ts` gzip + DPF1). Procédure `docs/dev/BACKUP.md`.
- Abonnements (ADR-040, 041) : `src/subscriptions/` — `StoreReceiptVerifier` (jeton `STORE_RECEIPT_VERIFIER`), `AppleSignedDataVerifier` (racine G3 embarquée) vérifie **tout** JWS Apple, `GooglePlayVerifier`, env `APP_STORE_*`/`GOOGLE_PLAY_*` tout ou rien. Droits : `loadEntitlements(tx, userId, now)` / `canExportExcel` **pour toute fonction Premium**. Une notification de store ne fait que relancer `SubscriptionsService.refresh`.

## Reliquats mineurs assumés (dette connue)

- P1-08 : utilitaire `sha256` commun ; tests HTTP 503/500 de `/auth/social` ; `retryableErrno` à réécrire sur `hasErrno` ; un seul rejeu sur course d'identité.
- P1-09 : pas de test « même transaction » carnet/user ; `GET /notebooks/:id` relit la base après la garde.
- P2-01 : pas de FK composite `(notebook_id, parent_id)` ; pas de test de concurrence sur la hiérarchie ; rejeu avec `parentId` différent non testé.
- P2-03 : paramètre inconnu non nommé dans `detail` ; `q` borné à 100 avant NFC ; filtre catégorie exact (parents sans enfants) ; pas d'index plein texte.
- P2-04 : marge du filigrane non éprouvée ; `DELETE … LIMIT` sans `ORDER BY`.
- P3-01 : repli `ER_DUP_ENTRY` → 409 non testé ; version « de demain » non modifiable avant son jour ; `appliesFrom` absent de la sync.
- P4-01/02 : course « même `expenseId` payé depuis un autre carnet » non testée ; rejeu de `pay` après purge → 409 ; pas d'annulation de « sauter » ; `processOne` ne revérifie pas `notebook.deleted_at` sous verrou ; pas de test `POST …/pay` vs cron ; passage non borné en durée ; après repli « catégorie inutilisable », `pay` → 422.
- P4-04 : course de `registerDevice` (`devices.ts`) sur un même jeton (piste : INSERT simple + reprise sur 1062).
- P4-07 : `handle`/`finish` dupliqués entre `export-job.ts` et `account-export-job.ts` ; pas de plafond de demandes en attente ; collecte hors transaction.
- `parseAmountInput` suppose 2 décimales (à revoir avec F-DEP-08) ; seau « compte » commun à `/auth/login` et à la connexion admin (ADR-067) ; statistiques admin par jour UTC ; horloge d'appareil en avance (ADR-068).
