# PROGRESS — journal de passation entre sessions

Ce fichier est le **seul** état transmis d'une session Claude Code à la suivante. Tiens-le court : la session suivante le lit en premier et ne doit pas avoir à relire tout le dépôt.
Garde au plus 10 entrées dans l'historique ; résume les plus anciennes.

## État courant

- Tâche en cours : aucune
- Prochaine tâche : P1-01 (squelette NestJS `apps/api`)
- Dernier commit : feat(shared): limit periods … (P0-05)
- Branche : main
- Tests : `pnpm -r typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` verts (9 tests scripts/, 134 vitest shared), `pnpm test:tz` vert (suites `*.tz.test.ts` sous les 4 TZ). Couverture shared 98,7 % (`pnpm --filter @depenseo/shared coverage`)

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
- Les remplacements par script échouent silencieusement après un passage de Prettier (tableaux reformatés) : toujours `grep` le résultat.

## Actions humaines (non bloquantes)

- Pousser `main` vers `origin` (dépôt **public**, rien n'a été poussé depuis 5+ commits), puis noter ici le résultat du premier run CI (critère P0-03).
- Relever `SELECT VERSION()` sur o2switch et ajuster l'image `mariadb:10.6.28` si besoin.

## BLOQUÉ

(rien)

## Historique (plus récent en haut)

- 2026-11-04 — Session 2 : P0-05 (périodes + todayIn, ADR-012, coverage-v8 ajouté).

- 2026-11-04 — Session 1 : P0-02 (MariaDB compose, ADR-010), P0-03 (CI, run GitHub en attente de push humain), P0-04 (shared montants/dates, ADR-011) ; handoff après 3 tâches.

- 2026-11-04 — Session d'amorçage : plan affiné (60 tâches, renumérotées), `TRACEABILITY.md`, ADR-003 à 009 ; P0-01 faite (monorepo pnpm, TS strict, ESLint + règle dates, Prettier).

- 2026-11-04 — Initialisation du kit : CLAUDE.md, PLAN.md, hooks, agents. Aucun code applicatif encore.
