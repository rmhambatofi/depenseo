# PROGRESS — journal de passation entre sessions

Ce fichier est le **seul** état transmis d'une session Claude Code à la suivante. Tiens-le court : la session suivante le lit en premier et ne doit pas avoir à relire tout le dépôt.
Garde au plus 10 entrées dans l'historique ; résume les plus anciennes.

## État courant

- Tâche en cours : aucune
- Prochaine tâche : P0-01
- Dernier commit : (aucun)
- Branche : main
- Tests : non exécutés

## Pièges connus (à lire avant de coder)

- Versions relevées le 2026-11-04 : Node **v26.10.0** local (cible 22, voir ADR-006 ; pas de nvm/fnm/volta, `n` présent dans /usr/local/bin), pnpm 9.15.4, Docker Compose v5.1.0, Flutter 3.47.6 / Dart 3.13.5, git 2.45.2.
- Le démon Docker peut être arrêté : lancer Docker Desktop (`open -a Docker`) avant P0-02 et tout test API.
- Le plan a été renuméroté le 2026-11-04 (session d'amorçage) : se fier aux IDs actuels de PLAN.md et à TRACEABILITY.md.

## BLOQUÉ

(rien)

## Historique (plus récent en haut)

- 2026-11-04 — Initialisation du kit : CLAUDE.md, PLAN.md, hooks, agents. Aucun code applicatif encore.
