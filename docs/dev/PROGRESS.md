# PROGRESS — journal de passation entre sessions

Ce fichier est le **seul** état transmis d'une session Claude Code à la suivante. Tiens-le court : la session suivante le lit en premier et ne doit pas avoir à relire tout le dépôt.
Garde au plus 10 entrées dans l'historique ; résume les plus anciennes.

## État courant

- Tâche en cours : aucune
- Prochaine tâche : P0-02
- Dernier commit : (aucun)
- Branche : main
- Tests : `pnpm -r typecheck`, `pnpm lint`, `pnpm test` verts (2 tests de règle ESLint, shared sans test)

## Pièges connus (à lire avant de coder)

- Versions relevées le 2026-11-04 : Node **v26.10.0** local (cible 22, voir ADR-006 ; pas de nvm/fnm/volta, `n` présent dans /usr/local/bin), pnpm 9.15.4, Docker Compose v5.1.0, Flutter 3.47.6 / Dart 3.13.5, git 2.45.2.
- Le démon Docker peut être arrêté : lancer Docker Desktop (`open -a Docker`) avant P0-02 et tout test API.
- TypeScript épinglé à **6.0.3** : typescript-eslint 8.72 exige `typescript <6.1.0` (TS 7 natif non supporté). Ne pas monter TS sans vérifier le peer.
- `pnpm -r lint` n'inclut pas la racine : `pnpm lint` (racine) lint aussi `scripts/` ; `pnpm test` (racine) lance `node --test scripts/*.test.mjs` puis les tests des paquets.
- Règle `no-restricted-syntax` (eslint.config.mjs) : rejette `new Date(…)` et `Date.parse(…)` sur AAAA, AAAA-MM ou AAAA-MM-JJ, en littéral ou en gabarit sans expression ; les fixtures `scripts/lint-fixtures/` sont ignorées sauf par le test.
- Le plan a été renuméroté le 2026-11-04 (session d'amorçage) : se fier aux IDs actuels de PLAN.md et à TRACEABILITY.md.

## BLOQUÉ

(rien)

## Historique (plus récent en haut)

- 2026-11-04 — Session d'amorçage : plan affiné (60 tâches, renumérotées), `TRACEABILITY.md`, ADR-003 à 009 ; P0-01 faite (monorepo pnpm, TS strict, ESLint + règle dates, Prettier).

- 2026-11-04 — Initialisation du kit : CLAUDE.md, PLAN.md, hooks, agents. Aucun code applicatif encore.
