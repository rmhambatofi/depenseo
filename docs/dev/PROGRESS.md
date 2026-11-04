# PROGRESS — journal de passation entre sessions

Ce fichier est le **seul** état transmis d'une session Claude Code à la suivante. Tiens-le court : la session suivante le lit en premier et ne doit pas avoir à relire tout le dépôt.
Garde au plus 10 entrées dans l'historique ; résume les plus anciennes.

## État courant

- Tâche en cours : aucune
- Prochaine tâche : P0-03
- Dernier commit : feat(infra): MariaDB 10.6 docker-compose … (P0-02)
- Branche : main
- Tests : `pnpm -r typecheck`, `pnpm lint`, `pnpm test` verts (9 tests scripts/ dont 7 base ; shared sans test)

## Pièges connus (à lire avant de coder)

- Versions relevées le 2026-11-04 : Node **v26.10.0** local (cible 22, voir ADR-006 ; pas de nvm/fnm/volta, `n` présent dans /usr/local/bin), pnpm 9.15.4, Docker Compose v5.1.0, Flutter 3.47.6 / Dart 3.13.5, git 2.45.2.
- Le démon Docker peut être arrêté : lancer Docker Desktop (`open -a Docker`) avant P0-02 et tout test API (démarré en fin de session d'amorçage, moteur 29.3.0).
- Sous-agent `reviewer` : son prompt système contient « VERDICT: OK » ; ne pas détecter sa fin par grep du transcript, attendre la notification.
- TypeScript épinglé à **6.0.3** : typescript-eslint 8.72 exige `typescript <6.1.0` (TS 7 natif non supporté). Ne pas monter TS sans vérifier le peer.
- `pnpm -r lint` n'inclut pas la racine : `pnpm lint` (racine) lint aussi `scripts/` ; `pnpm test` (racine) lance `node --test scripts/*.test.mjs` puis les tests des paquets.
- Règle `no-restricted-syntax` (eslint.config.mjs) : rejette `new Date(…)` et `Date.parse(…)` sur AAAA, AAAA-MM ou AAAA-MM-JJ, en littéral ou en gabarit sans expression ; les fixtures `scripts/lint-fixtures/` sont ignorées sauf par le test.
- Le plan a été renuméroté le 2026-11-04 (session d'amorçage) : se fier aux IDs actuels de PLAN.md et à TRACEABILITY.md.

- `pnpm test` exige la base : `docker compose up -d db && scripts/db-wait.sh` (ADR-010). Volume neuf : `docker compose down -v`.
- Base locale volontairement « hostile » : fuseau SYSTEM = Europe/Paris, REPEATABLE-READ, pas de forçage du charset client. P1-02 doit forcer `+00:00`, READ COMMITTED et la collation utf8mb4_unicode_520_ci côté mysql2 (ne pas « corriger » le cnf).
- Comptes : `depenseo_api`/`depenseo_admin` (DML seul, pas de TRUNCATE/DDL), `depenseo_migrator` (tout) sur `depenseo` et `depenseo_test` ; mots de passe dev `<compte>_dev` sauf root `depenseo_root_dev`. Nettoyer les tests avec le compte migrator.
- Image épinglée `mariadb:10.6.28` ; la version réelle d'o2switch (`SELECT VERSION()`) reste à relever par l'humain.

## BLOQUÉ

(rien)

## Historique (plus récent en haut)

- 2026-11-04 — Session 1 : P0-02 faite (docker-compose MariaDB 10.6.28, db-wait.sh, 3 comptes, ADR-010 ; CI P0-03 réutilisera le compose).

- 2026-11-04 — Session d'amorçage : plan affiné (60 tâches, renumérotées), `TRACEABILITY.md`, ADR-003 à 009 ; P0-01 faite (monorepo pnpm, TS strict, ESLint + règle dates, Prettier).

- 2026-11-04 — Initialisation du kit : CLAUDE.md, PLAN.md, hooks, agents. Aucun code applicatif encore.
