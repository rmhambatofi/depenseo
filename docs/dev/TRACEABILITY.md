# TRACEABILITY — exigences « M » → tâches → tests

Source : `docs/cahier-des-charges.md` révision 4. Périmètre : toutes les exigences fonctionnelles de priorité **M** (§4) et toutes les exigences non fonctionnelles de §7 (sans priorité, donc traitées comme M, ADR-008), hors volet web V2.
Les chemins de tests sont **prévus** : la tâche qui les crée met à jour la colonne si le nom change. P7-01 vérifie que chaque test existe et passe.
Conventions : API `apps/api/test/**/*.spec.ts` (intégration contre MariaDB 10.6) ; shared `packages/shared/src/**/*.test.ts` ; mobile `mobile/test/**/*_test.dart`.

## Exigences fonctionnelles

| Exigence M | Tâche(s) PLAN | Test(s) prévus |
| --- | --- | --- |
| F-AUTH-01 Inscription e-mail + vérification | P1-05, P1-06, P6-02 | `api/test/auth/register.spec.ts`, `api/test/auth/login.spec.ts`, `mobile/test/auth/account_flow_test.dart` (inscription, lien de vérification), `mobile/test/auth/login_flow_test.dart` |
| F-AUTH-02 Connexion Apple et Google | P1-08, P6-02 | `api/test/auth/social-login.spec.ts` (jetons factices signés), `mobile/test/auth/social_login_test.dart` |
| F-AUTH-03 Reset mot de passe 30 min usage unique | P1-07, P6-02 | `api/test/auth/password-reset.spec.ts` (expiré à 30 min + 1 s, second usage refusé), `mobile/test/auth/account_flow_test.dart` (demande, lien, lien invalide) |
| F-AUTH-04 Verrouillage biométrie/code, délai réglable | P6-03 | `mobile/test/security/app_lock_test.dart` |
| F-AUTH-07 Suppression du compte et des données | P4-06, P6-12 | `api/test/me/account-deletion.spec.ts` (parcours de toutes les tables), `mobile/test/account/delete_account_test.dart` |
| F-AUTH-08 Export des données personnelles JSON + CSV | P4-07, P6-12 | `api/test/me/account-export.spec.ts` (toutes les tables par information_schema), `mobile/test/account/personal_export_test.dart` |
| F-DEP-01 Saisie < 10 s, bouton « + » permanent | P6-04 | `mobile/test/expenses/quick_entry_test.dart` (≤ 3 interactions) |
| F-DEP-02 Clavier localisé, virgule/point | P0-04, P6-04 | `shared/src/amount.test.ts` (`parseAmountInput`), `mobile/test/expenses/amount_input_test.dart` |
| F-DEP-03 Champs montant, catégorie, date, note, marchand, étiquettes | P2-02, P6-04 | `api/test/expenses/expenses-crud.spec.ts`, `mobile/test/expenses/quick_entry_test.dart` |
| F-DEP-09 Recherche texte/montant/catégorie/période | P2-03, P6-06 | `api/test/expenses/expenses-search.spec.ts` (« energie » → « Énergie »), `mobile/test/expenses/expense_list_test.dart`, `mobile/test/expenses/expense_store_test.dart` (filtres combinés, accents) |
| F-DEP-10 Modification, suppression, annulation 5 s | P2-02, P6-06 | `api/test/expenses/expenses-lifecycle.spec.ts` (suppression logique + restauration), `mobile/test/expenses/expense_list_test.dart` (annulation à 4 s / écrite à 6 s, conflit : restaurer / abandonner), `mobile/test/expenses/expense_store_test.dart` |
| F-CAT-01 Plan de catégories français | P2-01, P6-07 | `api/test/categories/categories.spec.ts` (14 racines, langue d’inscription), `mobile/test/categories/categories_screen_test.dart` (arbre, masquage, nom/icône/couleur, création), `category_store_test.dart` |
| F-CAT-02 Catégories personnalisées, masquables | P2-01, P6-07 | `api/test/categories/categories.spec.ts` (emoji, masquage, suppression logique), `mobile/test/categories/categories_screen_test.dart` (arbre, masquage, nom/icône/couleur, création), `category_store_test.dart` |
| F-REC-01 Récurrence : nom, montant, fréquence, jour, catégorie | P4-01, P6-09 | `api/test/recurring/schedule.spec.ts` (31 → 30/28/29, trimestriel du 31/01), `api/test/recurring/recurring-crud.spec.ts`, `api/test/recurring/recurring.tz.spec.ts`, `mobile/test/recurring/recurring_edit_test.dart` |
| F-REC-02 Enregistrement auto ou confirmation | P4-02, P6-09 | `api/test/recurring/due-occurrences.tz.spec.ts` (cron rejoué → 1 dépense, notification unique, 4 fuseaux + changement d'heure), `mobile/test/recurring/recurring_screen_test.dart` (« Confirmer »), `mobile/test/recurring/recurring_edit_test.dart` (mode automatique) |
| F-REC-03 Ajuster, payer, sauter une échéance | P4-01, P6-09 | `api/test/recurring/occurrences.spec.ts`, `mobile/test/recurring/recurring_screen_test.dart`, `mobile/test/recurring/recurring_api_test.dart` |
| F-REC-04 Rappels J-3 / jour J à l'heure locale | P4-03, P6-09 | `api/test/recurring/reminders.tz.spec.ts` (4 fuseaux + DST), `api/test/recurring/recurring-crud.spec.ts` (réglages), ADR-034, `mobile/test/recurring/recurring_edit_test.dart` (J-3 / jour J), `mobile/test/recurring/recurring_screen_test.dart` (heure des rappels) |
| F-LIM-01 Limite globale facultative mois/semaine | P3-01, P6-08 | `api/test/limits/limits-crud.spec.ts`, `mobile/test/limits/limit_settings_test.dart` |
| F-LIM-02 Début de période réglable | P0-05, P3-01, P6-08 | `shared/src/period.tz.test.ts`, `api/test/limits/limits-crud.spec.ts` |
| F-LIM-03 Dépensé, restant, rythme | P3-02, P6-08 | `api/test/limits/period-summary.spec.ts`, `api/test/limits/period-summary-http.spec.ts`, `api/test/limits/period-summary.tz.spec.ts`, `mobile/test/limits/limit_gauge_test.dart` |
| F-LIM-04 Alertes 80 %, 100 %, dépassement significatif | P3-03 | `api/test/limits/limit-alerts.spec.ts` (idempotence, 110 %/120 %) |
| F-LIM-05 Inclure ou non les récurrences | P3-01, P3-02, P6-08 | `api/test/limits/period-summary.spec.ts`, `api/test/limits/period-summary-http.spec.ts` (cas avec/sans récurrences) |
| F-LIM-09 Changement de limite sans réécrire l'historique | P3-01, P6-08 | `api/test/limits/limit-history.spec.ts`, `api/test/limits/limits-crud.spec.ts` |
| F-EXP-01 Export Excel et CSV sur période | P4-05, P6-12 | `api/test/exports/exports.spec.ts`, `csv.spec.ts`, `xlsx.spec.ts`, `mobile/test/account/expense_export_test.dart` |
| F-TB-01 Accueil : jauge, échéances, dernières dépenses | P3-05, P4-01, P6-10 | `api/test/dashboard/dashboard.spec.ts`, `api/test/recurring/occurrences.spec.ts` (`upcoming`), `mobile/test/home/home_screen_test.dart` |
| F-TB-02 Graphiques : répartition, cumul vs précédente, 12 périodes | P3-05, P6-10 | `api/test/dashboard/dashboard.tz.spec.ts`, `mobile/test/home/charts_test.dart` |
| F-NOT-01 Push : 80/100 %, échéance, dépense inhabituelle | P3-03, P3-04, P4-02, P4-04, P6-11 | `api/test/limits/limit-alerts.spec.ts`, `api/test/notifications/unusual-expense.spec.ts`, `api/test/notifications/notify-handler.spec.ts`, `api/test/notifications/push-senders.spec.ts`, `api/test/notifications/devices.spec.ts` |
| F-NOT-02 Rappel quotidien facultatif à l'heure choisie | P4-03, P6-11 | `api/test/notifications/daily-reminder.tz.spec.ts` (4 fuseaux + DST), `api/test/me/me.spec.ts` (réglage), ADR-034 |
| F-NOT-04 Réglage par type, plage de silence | P4-04, P6-11 | `api/test/notifications/quiet-hours.tz.spec.ts` (22:00–07:00 en local), `api/test/notifications/notify-handler.spec.ts` (type désactivé, report), `mobile/test/notifications/settings_test.dart` |
| F-NOT-05 Aucun montant sur l'écran verrouillé | P4-04, P6-11 | `api/test/notifications/notify-handler.spec.ts`, `api/test/notifications/notification-text.spec.ts` (aucun montant dans les charges utiles, ADR-003) |
| F-ABO-01 Achats intégrés vérifiés serveur + notifications stores | P5-01, P5-02, P6-13 | `api/test/subscriptions/verify-receipt.spec.ts`, `api/test/subscriptions/{app-store,google-play}-verifier.spec.ts`, `api/test/subscriptions/store-notifications.spec.ts` (401, renouvellement, expiration → Excel 403 données conservées), `api/test/subscriptions/apple-signed-data.spec.ts` (chaîne x5c), `mobile/test/premium/purchase_test.dart` |
| F-ABO-02 Essai Premium 14 jours | P5-01, P6-13 | `api/test/subscriptions/trial.spec.ts` (expiré au jour 15), `api/test/subscriptions/trial.tz.spec.ts`, `api/test/subscriptions/entitlements.spec.ts` |
| F-ABO-03 Restauration, multi-appareils | P5-01, P6-13 | `api/test/subscriptions/restore.spec.ts`, `mobile/test/premium/restore_test.dart` |
| F-ADM-01 Back-office `/admin`, rôle admin, 2FA | P5-03, P5-04, P5-05 | `api/test/admin/totp.spec.ts`, `api/test/admin/admin-session.spec.ts` (TOTP, cookie), `api/test/admin/admin-routes.spec.ts`, `api/test/admin/admin-console.spec.ts` (service du build), `apps/admin/e2e/admin.spec.ts` (Playwright), `apps/admin/src/app/*.test.ts` |
| F-ADM-02 Aucun code admin dans le mobile ni le web public | P5-05, P6-01 | `scripts/check-no-admin-code.mjs` (exécuté en CI), `scripts/admin-code.test.mjs` |
| F-ADM-03 404 sans rôle admin, rôle attribué par script | P5-03, P5-05 | `api/test/admin/admin-access.spec.ts`, `api/test/admin/grant-admin.spec.ts`, `api/test/admin/admin-console.spec.ts`, `apps/admin/e2e/admin.spec.ts` |

## Exigences non fonctionnelles

| Exigence | Tâche(s) PLAN | Test(s) prévus |
| --- | --- | --- |
| NF-FMT-01 Montants en centimes entiers, devise ISO 4217 | P0-04, P1-03, P2-02 | `shared/src/amount.test.ts`, `api/test/db/schema-invariants.spec.ts` (aucun FLOAT/DOUBLE) |
| NF-FMT-02 Dates calendaires sans fuseau | P0-05, P1-02, P2-02, P6-14 | `api/test/db/session.tz.spec.ts`, `api/test/expenses/expenses-crud.spec.ts` |
| NF-FMT-03 Horodatages UTC, affichés en local | P1-02, P1-03, P6-14 | `api/test/db/session.tz.spec.ts`, `mobile/test/dates/timestamps_test.dart` |
| NF-FMT-04 Aujourd'hui, semaines, périodes dans le fuseau utilisateur | P0-05, P1-10, P3-02 | `shared/src/period.tz.test.ts`, `api/test/limits/period-summary.tz.spec.ts`, `api/test/me/me.spec.ts` |
| NF-FMT-05 Tests 4 fuseaux + DST (API, mobile) | P0-05, P1-02, P3-02, P4-03, P6-14 | suites `*.tz.spec.ts` / `*.tz.test.ts` (commande `pnpm --filter api test:tz`), `mobile/test/dates/timezones_test.dart` |
| NF-FMT-06 Format des nombres selon la langue, saisie tolérante | P0-04, P6-04 | `shared/src/amount.test.ts` (`formatAmount` fr → « 1 234,56 € »), `mobile/test/expenses/amount_input_test.dart` |
| NF-FMT-07 `DATE` lu en chaîne, connexion en UTC | P1-02 | `api/test/db/session.tz.spec.ts` |
| NF-FMT-08 Pas de `new Date('AAAA-MM-JJ')`, `Intl.NumberFormat` | P0-01, P0-04 | `eslint-rules.test.ts` (fixture rejetée par `no-restricted-syntax`), `shared/src/amount.test.ts` |
| NF-SEC-01 Chiffrement transit/repos, clés hors code, rotation | P4-05, P4-08, P7-03, P7-07 | `api/test/exports/file-crypto.spec.ts`, `exports.spec.ts` (fichier illisible sans la clé), `api/test/backup/export-restore.spec.ts`, `docs/dev/DEPLOY.md` (rotation) |
| NF-SEC-02 Jetons 15 min, refresh révocables, stockage sécurisé | P1-06, P6-01, P6-02 | `api/test/auth/tokens.spec.ts`, `mobile/test/token_store_test.dart`, `mobile/test/session_refresh_test.dart` (refresh unique sérialisé), `mobile/test/auth/reinstall_guard_test.dart` |
| NF-SEC-03 Contrôle d'accès serveur sur chaque ressource | P1-09 (+ chaque tâche API) | `api/test/access/cross-tenant.spec.ts` (toutes les routes d'`openapi.json`) |
| NF-SEC-04 OWASP MASVS L2 | P7-03 | `docs/dev/MASVS.md`, `api/test/security/rate-limit.spec.ts`, `api/test/security/headers.spec.ts` |
| NF-SEC-05 Captures bloquées (option), sélecteur d'apps masqué | P6-03 | `mobile/test/security/app_switcher_mask_test.dart` |
| NF-SEC-06 Aucun montant/PII dans les logs, audit admin | P1-01, P5-03, P5-04, P7-05 | `api/test/logging/redaction.spec.ts`, `api/test/admin/admin-session.spec.ts` (audit), `api/test/admin/admin-routes.spec.ts` (audit, minimisation), `api/test/admin/admin-stats.spec.ts`, `api/test/observability/sentry-scrub.spec.ts` |
| NF-PERF-01 Accueil < 2 s | P7-06 | `mobile/integration_test/startup_perf_test.dart` (mesure consignée dans `docs/dev/PERF.md`) |
| NF-PERF-02 p95 API < 300 ms | P7-06 | `apps/api/bench/p95.bench.ts` (autocannon, seuil en CI) |
| NF-DISP-01 Sauvegarde, RPO 1 h, RTO 4 h | P4-08, P7-07 | `api/test/backup/export-restore.spec.ts`, `backup-files.spec.ts`, `docs/dev/BACKUP.md` |
| NF-OFF-01 Hors ligne, synchro sans doublon | P2-02, P2-04, P6-05 | `api/test/expenses/expenses-crud.spec.ts` (double envoi, simultané), `api/test/sync/sync-cursor.spec.ts`, `api/test/sync/sync-purge.spec.ts` (purge 30 j), `mobile/test/sync/offline_sync_test.dart` (rejeu sans doublon, conflits), `mobile/test/sync/sync_flow_test.dart` (déclencheurs, consultation hors ligne) |
| NF-QUA-01 Couverture ≥ 70 % logique métier | P7-02 | seuil `coverage.thresholds` vitest + `flutter test --coverage` vérifié en CI |
| NF-QUA-02 ≥ 99,5 % sessions sans plantage (Sentry UE) | P7-05 | `api/test/observability/sentry-scrub.spec.ts`, `mobile/test/observability/sentry_config_test.dart` |
| NF-QUA-03 CI, environnements séparés, même moteur partout | P0-01, P0-02, P0-03, P7-07 | `.github/workflows/ci.yml` (service MariaDB 10.6), `api/test/db/server-version.spec.ts` |
| NF-QUA-04 Accessibilité WCAG 2.1 AA | P7-04 | `mobile/test/a11y/guidelines_test.dart` (`meetsGuideline`), `docs/dev/A11Y.md` |
