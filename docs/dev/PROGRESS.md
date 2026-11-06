# PROGRESS — journal de passation entre sessions

État transmis d'une session Claude Code à la suivante, injecté par le hook SessionStart. **Garder ce fichier sous 10 Ko** : état courant, pièges transverses, index des pièges, actions humaines, BLOQUÉ, historique (≤ 10 lignes). Les pièges par domaine vont dans `docs/dev/pieges/`.

## État courant

**MVP terminé** (2026-11-05, session 53). **Phase 8 ouverte** (2026-11-06) : refonte visuelle de l'app mobile dans le style de BilliTime, demandée par le propriétaire du produit. Backlog V1/V2 **non démarré** (décision du propriétaire).

- Tâche en cours : aucune. **P8-07 fait** (saisie : `AmountEntryCard` + catégories en tuiles `CategoryChoiceTile` ; connexion/inscription/verrouillage sous `BrandTile`, formulaire en carte, pavé du code rond). **Prochaine tâche : P8-08** (recette visuelle). À y vérifier (relecteur P8-07) : sur petit téléphone clavier ouvert, au moins une rangée de tuiles de catégorie visible ; noter dans `A11Y.md` que les noms d'un seul mot sont réduits (`FittedBox`) en texte ×2.
- Rappels phase 8 : présentation seulement, aucune fonction de BilliTime absente du MVP (revenus, solde, virements, objectifs) ; garder toutes les `Key` des tests ; aucun calcul de total ou de pourcentage sur le téléphone (ajouter à `/dashboard` si besoin) ; `mobile/` ne doit jamais contenir la chaîne `/admin`.
- Dernier commit : feat(mobile): restyled quick entry, sign-in, sign-up and lock screens (F-DEP-01, F-DEP-02, F-AUTH-01, F-AUTH-04).
- Branche : main
- Tests (2026-11-06, P8-07) : Flutter 577 + `flutter analyze` et `dart format` propres, `tool/test_tz.sh` vert (4 fuseaux), a11y vert ; API non relancée (aucun fichier API touché).
- Restent en l'état, assumés : voir « Reliquats » de `pieges/api.md`, `pieges/mobile.md`, `pieges/admin.md`.

## Pièges transverses (toujours valables)

1. **Jamais deux suites API en parallèle** (`tester` et `reviewer`, banc, e2e admin) : le `globalSetup` vide `depenseo_test` → faux échecs. Tester d'abord, puis reviewer ; `pgrep -fl vitest` vide avant de lancer.
2. Lancer `tester`/`reviewer` **au premier plan** (`run_in_background: false`) : en arrière-plan, le hook Stop rebondit tant que le diff n'est pas committé. Si l'outil Agent les lance quand même en asynchrone (vu en session 55), ne pas finir le tour : bloquer par une boucle Bash (`while kill -0 <pid>` sur le `dartvm` de `flutter test`, `pgrep -f vitest`) — `pgrep -f 'flutter test'` ne trouve pas le processus. Attente fiable (session 56) : boucle sur l'heure de modification du fichier de sortie de l'agent (`stat -L -f %m` : c'est un lien symbolique, sans `-L` on lit l'heure du lien ; immobile > 45 s = fini) ; une boucle `pgrep` a tourné jusqu'au délai de Bash. Ne jamais `git stash` pendant qu'un sous-agent tourne.
3. `pnpm test` exige Docker et la base : `open -a Docker`, `docker compose up -d db && scripts/db-wait.sh`. Un seul fichier : `pnpm --filter api exec vitest run <fichier>` (sinon échec du seuil de couverture).
4. Remplacement par script après Prettier/`dart format` : échec silencieux → `assert old in s` en Python puis `grep -c`. Pas de `perl -pi` avec des `|` dans le motif.
5. Après une modif de contrat API : `pnpm --filter api openapi` et committer `openapi.json` + `packages/api-client/src/schema.ts`. Nouvelle route : la classer dans le harnais cross-tenant (et la liste des routes publiques si `@Public()`).
6. **Toute nouvelle table** : `populatedAccount`, `SOURCES` de l'export RGPD, `deleteAccount`, `notebookRows` (voir `pieges/api-db.md`).
7. Chaque suite API vit dans **sa plage de dates** (liste dans `pieges/api-tests.md`) ; en choisir une libre et l'y noter.
8. Vérifier qu'un test mord par contre-épreuve (mutation puis restauration). Charge machine > 20 : test API lent au hasard, relancer seul avant de soupçonner une régression.
9. Ne pas pousser sans accord humain (dépôt public).

## Index des pièges par domaine (lire seulement ceux de la tâche)

- `docs/dev/pieges/outils.md` — session et sous-agents, édition par script, versions, lint, traçabilité, CI.
- `docs/dev/pieges/api.md` — conventions NestJS, OpenAPI, gardes, modules métier (où est quoi), reliquats API.
- `docs/dev/pieges/api-db.md` — MariaDB, Drizzle, verrous, migrations, nouvelle table.
- `docs/dev/pieges/api-tests.md` — vitest, harnais, plages de dates par suite, barrières de verrou.
- `docs/dev/pieges/admin.md` — API admin, console React-admin, e2e Playwright.
- `docs/dev/pieges/mobile.md` — Flutter : thème, dates, Riverpod, SQLCipher, synchro, écrans, build.
- `docs/dev/pieges/mobile-tests.md` — tests widget (Drift, Dio, défilement), a11y, captures, fuseaux.
- `docs/dev/pieges/shared.md` — `packages/shared` (montants, périodes, Temporal) et `api-client`.

## Actions humaines (non bloquantes)

- **Mise en service** : suivre `docs/dev/DEPLOY.md` §10 (comptes de base, Node/CloudLinux, `.htaccess`, `TRUST_PROXY_HOPS`, crons, liens universels/Apple/Google/push sur appareil, premier admin, signature release Android).
- **Sentry** : organisation en région UE, variables `SENTRY_DSN`/`SENTRY_ENVIRONMENT`/`SENTRY_RELEASE` (API) et dart-defines (mobile), réglages serveur obligatoires (Data Scrubber, Prevent Storing of IP Addresses, Advanced Data Scrubbing « Remove $error.value » et « Remove $message ») car les erreurs natives contournent `beforeSend` Dart.
- **Performance** : remplir `docs/dev/PERF.md` (NF-PERF-01 sur téléphone, non vérifiée : debug simulateur ≈ 2,2–2,7 s ; NF-PERF-02 en recette).
- Pousser `main` vers `origin` (dépôt public, commits non poussés), puis noter ici le résultat du premier run CI (critère P0-03 ; vérifier le téléchargement SQLCipher sur Linux).
- Relever `SELECT VERSION()` sur o2switch et ajuster l'image `mariadb:10.6.28` si besoin.
- Textes légaux mobiles (`legal_texts.dart`) : brouillons à faire valider par un juriste.

## BLOQUÉ

(rien)

## Historique (plus récent en haut)

- 2026-11-06 session 60 — P8-07 fait (saisie rapide, connexion, inscription, verrouillage restylés ; `BrandTile`, `CategoryChoiceTile`, `AmountEntryCard`).
- 2026-11-06 session 59 — P8-06 fait (réglages, compte, catégories, limites, récurrentes restylés ; `GroupedCard`, `LimitProgressBar`). Handoff après 1 tâche (~20 fichiers lus).
- 2026-11-06 session 58 — P8-05 fait (liste des dépenses : mois, groupes par jour, tuile restylée, ADR-070). Handoff après 1 tâche (~20 fichiers lus).
- 2026-11-06 session 57 — P8-04 fait (accueil restylé, sélecteur de période sur `evolution`, conteneurs sémantiques des cartes). Handoff après 1 tâche (~20 fichiers lus).
- 2026-11-06 session 56 — P8-03 fait (barre du bas, « + » central, avatar, retour Android → Accueil, icônes rounded, parcours a11y « dépenses récurrentes (onglet) »). Handoff après 1 tâche (~20 fichiers lus).
- 2026-11-06 session 55 — P8-02 fait (49 clés d'icône, migration 0020 en comparaison binaire, sélecteur en grille, puces avec tuile, parcours a11y). Handoff après 1 tâche (~15 fichiers lus).
- 2026-11-06 — pièges déplacés de PROGRESS.md (71 Ko) vers `docs/dev/pieges/` par domaine ; hook SessionStart et `/next` allégés.
- 2026-11-06 session 54 — P8-01 fait (thème, police Plus Jakarta Sans OFL, jetons ajustés 4,5:1, choix Clair/Auto/Sombre persistant, harnais de captures, parcours a11y « réglages et apparence »). Handoff après 1 tâche.
- 2026-11-05 session 53 — P7-08 fait : relecture finale par 3 `reviewer` ; connexion admin limitée en débit (ADR-067) ; mineurs traités.
- 2026-11-05 session 52 — P7-07 fait : `DEPLOY.md`, protocole NF-PERF dans `PERF.md`, `seed:fake` (ADR-066).
- Sessions ≤ 51 (2026-11-04/05) : P0 à P6, P7-01 à P7-06 (détail dans `git log` et ADR-001…065).
