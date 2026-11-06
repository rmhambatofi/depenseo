# Pièges — outils, environnement, CI, session Claude Code

Lire avant toute tâche qui touche aux scripts, à la CI, aux versions ou à l'organisation d'une session.

## Session et sous-agents

- **Ne jamais lancer deux suites API en parallèle** (`tester` + `reviewer`, deux vitest, banc, e2e admin) : le `globalSetup` de vitest vide `depenseo_test` → `ER_NO_SUCH_TABLE`, `ER_TABLE_EXISTS_ERROR`, 500 aléatoires (constaté en P1-07 et P7-08). Toujours en séquence (tester, puis reviewer), `pgrep -fl vitest` vide ; relancer seul avant de conclure. Ne pas faire de mutation dans `test/` pendant qu'un sous-agent lance vitest.
- Lancer `tester` et `reviewer` **au premier plan** (`run_in_background: false`). En arrière-plan (y compris un agent repris par `SendMessage`), le hook Stop rebondit à chaque fin de tour tant que le diff n'est pas committé. Si un sous-agent tourne en arrière-plan : attendre la notification, ne jamais lire son fichier `.output` ; le `sleep` au premier plan est refusé (boucle `pgrep -f vitest` + `perl -e 'select(undef,undef,undef,5)'`).
- Lancer `pnpm lint` soi-même avant le tester final : `no-unsafe-*` sur `RowDataPacket` dans les tests (utiliser `String(r.x)`).
- Ne **jamais** `git stash` pendant qu'un sous-agent tourne : il teste alors un arbre amputé.
- Sous-agent `tester` : vérifie déjà la stabilité des tests de verrous en les relançant 3 fois.
- Vérifier qu'un test mord par contre-épreuve (mutation rapide du code puis restauration) : la relecture de P1-01 a trouvé un test de journal qui passait sans que la redaction serve. Une remarque du relecteur « non testé » peut être fausse : la vérifier par mutation avant d'ajouter un test.
- Contre-épreuve : `git checkout --` sans chemin ne restaure rien (affiche le statut) → `cp f f.bak` puis `mv f.bak f`. Fichier **non suivi** : `git diff --stat` n'affiche rien (`git diff --no-index`) ; restaurer depuis une copie et contrôler par `grep -c`.
- Hook `pre-bash.sh` : un long script Python en heredoc a été refusé sans motif visible → écrire le script dans un fichier temporaire puis l'exécuter, ou utiliser Edit.
- Charge machine > 20 (`uptime`) : un test d'intégration API au hasard dépasse ses 5 s (`account-deletion`, `cross-tenant`…), passe seul et au relancement. Vérifier la charge avant de soupçonner une régression ; ne pas désactiver.

## Édition par script

- Après un passage de Prettier ou `dart format`, les remplacements par script (sed, Python) échouent **silencieusement** (imports et tableaux reformatés) : `assert old in s` systématique en Python, puis `grep` du résultat. Un script Python à plusieurs substitutions qui échoue sur la 1re n'applique **aucune** des suivantes.
- `perl -pi -e 's|…|…|'` avec des `|` dans le motif : le `|` devient une alternative vide et corrompt **chaque ligne**. Utiliser Python avec `assert`.
- BSD sed ne connaît pas `\b` : `perl -pi -e`. `grep 'sql`${…}`'` : `$` est une ancre → `grep -F`. Un `&&` après un grep sans résultat interrompt la chaîne (fichier non écrit).
- Python peut transformer `﻿`/`￾` en caractères littéraux : vérifier par `grep -c $'\xef\xbb\xbf'`, rétablir par `perl -CSD -pi -e 's/\x{FEFF}/\\uFEFF/g'`. Espaces insécables : les écrire ` `/` ` dans le source (sinon `no-irregular-whitespace`) ; un heredoc peut les écrire littéralement.
- zsh : une variable contenant plusieurs chemins (`T="a b"; vitest run $T`) n'est **pas** découpée → aucun test lancé. Utiliser un tableau `T=(a b)`. URL avec `?` entre guillemets.

## Environnement et versions

- Relevé 2026-11-04 : Node **v26.10.0** local (cible 22, ADR-006 ; pas de nvm/fnm/volta, `n` dans /usr/local/bin), pnpm 9.15.4, Docker Compose v5.1.0 (moteur 29.3.0), Flutter 3.47.6 / Dart 3.13.5, git 2.45.2.
- Le démon Docker peut être arrêté : `open -a Docker` puis `docker compose up -d db && scripts/db-wait.sh` avant tout `pnpm test` (ADR-010). Volume neuf : `docker compose down -v`.
- TypeScript épinglé à **6.0.3** : typescript-eslint 8.72 exige `typescript <6.1.0`. Ne pas monter TS sans vérifier le peer.
- `pnpm -r lint` n'inclut pas la racine : `pnpm lint` (racine) lint aussi `scripts/` (projet eslint `scripts/tsconfig.json`, le projet par défaut plafonne à 8 fichiers). `pnpm test` (racine) lance `node --test scripts/*.test.mjs` puis les tests des paquets.
- `pnpm --filter api …` résout `@depenseo/api` (portée omise).
- Règle `no-restricted-syntax` (eslint.config.mjs) : rejette `new Date(…)`/`Date.parse(…)` sur AAAA, AAAA-MM ou AAAA-MM-JJ, littéral ou gabarit sans expression ; fixtures `scripts/lint-fixtures/` ignorées sauf par le test.
- `.gitignore` ignore `*.pem`/`*.key` : toute fixture de ce type doit être ré-incluse par `!chemin` (fait pour `apps/api/test/fixtures/apple-pki/`) ; vérifier `git status` avant de committer.

## Traçabilité et couverture

- `scripts/traceability.mjs` (dans `pnpm test` racine) vérifie que chaque chemin entre backticks de `TRACEABILITY.md` existe. Fichier à venir = suivi de `(P7-0x…` (tâche ouverte) ; **la tâche qui crée ce fichier retire la marque**. Renommer/déplacer un test cité → mettre à jour la matrice. Chemins complets (`api/`, `shared/` acceptés), pas de `*`.
- Mobile : tout fichier de `lib/` qu'aucun test ne charge fait échouer `scripts/lcov-threshold.mjs` (liste blanche : `main.dart`, `core/clock.dart`).

## CI

- Actions épinglées par SHA (checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.1, flutter-action v2.23.0) ; `pnpm lint:ci` = actionlint 1.7.12 via Docker. Vérifier les entrées d'une action sur son README à la version épinglée (`gh api repos/<o>/<r>/contents/README.md?ref=<tag>`).
- **Ne pas pousser sans accord humain** (dépôt public).
- La CI Linux télécharge la build SQLCipher (lien OpenSSL) : vérifier au premier passage.
