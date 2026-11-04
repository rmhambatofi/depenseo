# PLAN — Depenseo MVP

Statuts : `[ ]` à faire · `[~]` en cours · `[x]` fait · `[!]` bloqué (voir PROGRESS.md).
Chaque tâche cite ses exigences (IDs du cahier des charges). Une tâche = 1 à 3 commits, ≤ 1 session.
**Règle** : ne crée pas de tâche sans ID d'exigence ou sans critère de test. Découpe toute tâche qui dépasse une session.

## Phase 0 — Socle du dépôt

- [ ] P0-01 Monorepo pnpm : `pnpm-workspace.yaml`, `package.json` racine (scripts `typecheck`, `lint`, `test`), `tsconfig.base.json` strict, ESLint + Prettier, `.editorconfig`, `.gitignore`, `.nvmrc` (22). Critère : `pnpm -r typecheck` passe sur un paquet vide.
- [ ] P0-02 `docker-compose.yml` MariaDB 10.6 (utf8mb4_unicode_520_ci, port 3307) + script `scripts/db-wait.sh`. Critère : `SELECT VERSION()` retourne 10.6.x. (NF-QUA-03, §8.2)
- [ ] P0-03 GitHub Actions `ci.yml` : pnpm install, typecheck, lint, tests API avec service MariaDB 10.6, `flutter test`. Critère : workflow vert sur une PR vide. (NF-QUA-03)
- [ ] P0-04 `packages/shared` : types `Cents` (brand sur bigint/number entier), `CalendarDate` (string AAAA-MM-JJ validée), utilitaires `formatAmount(locale)`, `parseAmountInput` (virgule et point acceptés, « 42.50 » → 4250 centimes). Tests unitaires. (NF-FMT-01, 06, 08, F-DEP-02)
- [ ] P0-05 `packages/shared` : calcul de périodes (mois avec jour de début réglable, semaine lundi→dimanche avec jour réglable) en `Temporal.PlainDate`, avec suite de tests dans 4 fuseaux + DST. (F-LIM-02, NF-FMT-04, NF-FMT-05)

## Phase 1 — API : infrastructure et comptes

- [ ] P1-01 Squelette NestJS `apps/api` : config par env (zod), `GET /api/v1/health`, logger sans PII (redaction), gestion d'erreurs RFC 7807, OpenAPI généré dans `openapi.json`. (NF-SEC-06, §8.4)
- [ ] P1-02 Couche données : Drizzle + mysql2 avec `dateStrings: ['DATE']`, `timezone: 'Z'`, `SET time_zone='+00:00'` et `READ COMMITTED` à l'ouverture, retry 1213/1205, UUID v7 → `BINARY(16)` (helper + tests). Test d'intégration prouvant qu'un `DATE` ressort en chaîne. (NF-FMT-07, §8.2)
- [ ] P1-03 Migrations SQL versionnées (`drizzle-kit`) : tables `user`, `notebook`, `notebook_member`, `category`, `expense`, `expense_tag`, `tag`, `recurring_expense`, `occurrence`, `spending_limit` (colonne générée pour l'unicité), `job`, `subscription`, `refresh_token`, `audit_log`. Script `migrate` rejouable depuis une base vide (test CI). (§8.3, §8.2)
- [ ] P1-04 Auth e-mail + mot de passe : inscription, vérification e-mail (jeton usage unique), connexion, jetons d'accès 15 min + refresh révocables, reset mot de passe lien 30 min. E-mails via interface `Mailer` (adaptateur SMTP + faux en test). Tests e2e. (F-AUTH-01, 03, NF-SEC-02)
- [ ] P1-05 Connexion Apple et Google : vérification des `id_token` côté serveur, rattachement à un compte existant par e-mail vérifié. Tests avec jetons factices signés. (F-AUTH-02)
- [ ] P1-06 `GET/PATCH /me` (langue, fuseau, devise, consentements), `DELETE /me` avec purge immédiate de toutes les données, `GET /me/export` JSON + CSV via tâche de fond. Tests. (F-AUTH-07, 08)
- [ ] P1-07 Garde d'accès générique : chaque ressource vérifie l'appartenance au carnet ; tests automatisés « utilisateur B ne voit pas les données de A » sur toutes les routes. (NF-SEC-03)
- [ ] P1-08 Carnets : carnet personnel créé à l'inscription, `GET /notebooks`. (§8.3)

## Phase 2 — API : dépenses et catégories

- [ ] P2-01 Catégories par défaut (plan français §F-CAT-01, avec sous-catégories, icône, couleur) créées à l'inscription ; CRUD catégories personnalisées, masquage. (F-CAT-01, 02)
- [ ] P2-02 Dépenses : création idempotente par UUID client (`ON DUPLICATE KEY UPDATE`), modification, suppression logique, champs montant/catégorie/date/note/marchand/étiquettes, `source`. Tests dont double envoi hors ligne sans doublon. (F-DEP-01, 03, 10, NF-OFF-01)
- [ ] P2-03 Recherche et filtres : texte (insensible aux accents via collation), montant min/max, catégorie, période ; pagination par curseur. Tests. (F-DEP-09)
- [ ] P2-04 Synchronisation différentielle : `GET /expenses?updated_since=&cursor=` curseur `(updated_at, id)`, inclut les suppressions logiques ; purge des suppressions > 30 jours (tâche). Tests de curseur avec horodatages identiques. (§8.2)

## Phase 3 — API : limites et tableau de bord

- [ ] P3-01 Limite globale : création/modification avec `date d'effet` (historique conservé), période mois/semaine, jour de début, inclusion des récurrences. Tests : changer la limite ne réécrit pas les périodes passées. (F-LIM-01, 02, 05, 09)
- [ ] P3-02 Service `PeriodSummary` : dépensé, restant, rythme (« 62 % à 40 % du mois »), pour la période courante et N périodes passées, calculé dans le fuseau de l'utilisateur. Suite multi-fuseaux + DST. (F-LIM-03, NF-FMT-04, 05)
- [ ] P3-03 Alertes 80 % / 100 % / dépassement significatif : détection à chaque écriture de dépense, création de tâche `notify` dans la même transaction, idempotence par clé d'unicité. (F-LIM-04, F-NOT-01)
- [ ] P3-04 `GET /dashboard` : jauge période courante, prochaines échéances, dernières dépenses, répartition par catégorie, cumul vs période précédente, évolution 12 périodes. Tests. (F-TB-01, 02, F-WEB-06)

## Phase 4 — API : récurrences, file de tâches, notifications, exports

- [ ] P4-01 File de tâches : table `job` (type, payload JSON sans PII, run_at UTC, attempts, status, unique_key), `scripts/jobs-run.ts` lancé par cron (≤ 50 s, `SELECT … FOR UPDATE SKIP LOCKED`, `GET_LOCK` pour la planification), retry exponentiel, échec après 5 essais, purge 7 jours. Tests de concurrence (2 workers). (§8.2)
- [ ] P4-02 Dépenses récurrentes : modèle (nom, montant fixe/estimé, fréquence hebdo/mensuel/trimestriel/annuel/ponctuel, jour, catégorie, auto ou confirmation), génération des échéances, actions payer/ajuster/sauter. Tests sur fins de mois (31 → 30/28) et années bissextiles. (F-REC-01, 02, 03)
- [ ] P4-03 Rappels J-3 / jour J à l'heure locale de l'utilisateur, planifiés par la tâche cron ; rappel quotidien de saisie à l'heure choisie. Tests dans 4 fuseaux. (F-REC-04, F-NOT-02)
- [ ] P4-04 Notifications push : interface `PushSender` (APNs + FCM, faux en test), enregistrement des appareils, réglages par type + plage de silence, contenu sans montant en mode discret. (F-NOT-01, 04, 05)
- [ ] P4-05 Export CSV et Excel sur période : tâche de fond, fichier chiffré AES-256-GCM hors dossier public, servi par l'API avec lien expirable. Tests. (F-EXP-01, NF-SEC-01, §8.1)
- [ ] P4-06 Export horaire chiffré de la base (`scripts/db-export.ts`) + procédure de restauration documentée dans `docs/dev/BACKUP.md` et testée en CI. (NF-DISP-01, §8.2)

## Phase 5 — API : abonnements et back-office

- [ ] P5-01 Abonnements : vérification serveur des reçus App Store et Google Play (interfaces + faux en test), essai 14 jours, restauration multi-appareils, points d'entrée signés pour les notifications serveur des stores, passage en lecture seule des fonctions Premium à expiration. (F-ABO-01, 02, 03, §5)
- [ ] P5-02 Rôle admin + TOTP : attribution uniquement par `scripts/grant-admin.ts`, session admin par cookie `HttpOnly; Secure; SameSite=Strict; Path=/admin`, 404 sur `/admin/*` et `/api/v1/admin/*` sans rôle (test automatisé), journal d'audit. (F-ADM-01, 03, NF-SEC-06)
- [ ] P5-03 `apps/admin` React-admin : utilisateurs, abonnements, tâches en échec, statistiques, journaux. Build servi par l'API uniquement à une session admin ; seule la page de connexion est publique. Test Playwright du 404. (F-ADM-01, 02)
- [ ] P5-04 `packages/api-client` généré depuis `openapi.json` (openapi-typescript + fetch client), script `pnpm --filter api openapi`, vérifié en CI (diff vide). (§8.1, §8.5)

## Phase 6 — Application mobile Flutter

- [ ] P6-01 Squelette `mobile/` : Flutter 3, Riverpod, go_router, i18n fr/en (ARB), thème, Drift + SQLCipher (clé dans Keychain/Keystore), client API (dio) + jetons dans le trousseau sécurisé. `flutter analyze` et `flutter test` verts. (NF-SEC-02, §8.1)
- [ ] P6-02 Auth : inscription, connexion, Apple/Google, reset, verrouillage biométrie/code avec délai (immédiat, 1 min, 5 min), masquage dans le sélecteur d'apps. (F-AUTH-01 à 04, NF-SEC-05)
- [ ] P6-03 Saisie rapide : bouton « + » permanent, clavier numérique localisé (virgule/point), champs montant/catégorie/date/note/marchand/étiquettes, enregistrement local immédiat puis synchro. Test widget : saisie en 3 écrans max. (F-DEP-01, 02, 03)
- [ ] P6-04 Hors ligne : file d'envoi locale, UUID v7 généré sur l'appareil, synchro différentielle au retour réseau, résolution « dernière écriture gagne » par `updated_at`. Tests de synchro sans doublon. (NF-OFF-01)
- [ ] P6-05 Liste, recherche, filtres, modification et suppression avec annulation 5 s. (F-DEP-09, 10)
- [ ] P6-06 Catégories : plan par défaut, personnalisation, masquage. (F-CAT-01, 02)
- [ ] P6-07 Limites : choix mensuel/hebdo ou aucune, jour de début, inclusion des récurrences ; affichage dépensé/restant/rythme lu depuis l'API. (F-LIM-01 à 05, 09)
- [ ] P6-08 Récurrences : création, échéances, payer/ajuster/sauter, rappels. (F-REC-01 à 04)
- [ ] P6-09 Accueil et graphiques fl_chart : jauge, prochaines échéances, dernières dépenses, répartition, cumul vs période précédente, 12 périodes. (F-TB-01, 02)
- [ ] P6-10 Notifications push (FCM/APNs), réglages par type, plage de silence, rappel quotidien. (F-NOT-01, 02, 04, 05)
- [ ] P6-11 Compte : export JSON/CSV, suppression du compte, abonnement Premium (in-app purchase, essai 14 jours, restauration, résiliation en un clic vers le store), mentions légales / CGU / confidentialité. (F-AUTH-07, 08, F-ABO-01 à 03, §6)
- [ ] P6-12 Tests de dates sur l'app : mêmes 4 fuseaux + DST sur les calculs d'affichage (`TZDateTime` / chaînes). (NF-FMT-05)

## Phase 7 — Recette

- [ ] P7-01 Matrice de traçabilité `docs/dev/TRACEABILITY.md` : chaque exigence « M » → test(s). Aucune ligne vide. (§11.1)
- [ ] P7-02 Couverture ≥ 70 % sur la logique métier API et mobile, rapport en CI. (NF-QUA-01)
- [ ] P7-03 Auto-évaluation OWASP MASVS L2 dans `docs/dev/MASVS.md`, en-têtes de sécurité (CSP, HSTS), limitation de débit sur `/auth`. (NF-SEC-04)
- [ ] P7-04 Accessibilité : labels sémantiques, contrastes, tailles dynamiques sur les parcours clés ; check-list dans `docs/dev/A11Y.md`. (NF-QUA-04)
- [ ] P7-05 Documentation de déploiement o2switch (`docs/dev/DEPLOY.md`) : Passenger, variables d'env, cron (jobs chaque minute, health, export horaire), `.htaccess`. (§8.5)
- [ ] P7-06 Relecture finale par sous-agent `reviewer` sur chaque paquet ; corrections ; `PROGRESS.md` passé à « MVP terminé ».

<!-- backlog -->
## Backlog V1/V2 (hors boucle autonome)

Partage de carnet (F-PAR-*), import de relevés (F-IMP-*), pièces jointes (F-DEP-07), devises (F-DEP-08), ventilation (F-DEP-06), modèles rapides (F-DEP-05), catégorie proposée et règles (F-CAT-03, 04), limites par catégorie (F-LIM-07), projection (F-LIM-06), historique des limites (F-LIM-08), analyses (F-TB-03), widget (F-TB-05), rapport PDF (F-EXP-02), résumé de période (F-NOT-03), appareils connectés (F-AUTH-06), mode discret (F-AUTH-05), mode sans compte (F-AUTH-09), version web (F-WEB-*).
