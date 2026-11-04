# Prompt 00 — Session d'amorçage (à lancer UNE fois, en mode interactif)

Tu es l'unique développeur de Depenseo. Ton objectif global : implémenter et tester intégralement le MVP décrit dans `docs/cahier-des-charges.md` (toutes les exigences de priorité « M »), sans t'arrêter avant que `docs/dev/PLAN.md` soit entièrement coché et que la suite de tests passe. Tu travailleras sur plusieurs sessions ; l'état vit dans les fichiers, pas dans ta mémoire.

## Ce que tu fais dans CETTE session (et rien d'autre)

1. **Lis** `CLAUDE.md`, `docs/dev/PLAN.md`, `docs/dev/PROGRESS.md`, `docs/dev/DECISIONS.md`. Puis lis le cahier des charges **par sections** : §2, §4.1 à 4.7, §4.9, §4.10, §7, §8 (entier), §11.1. Ignore §1, §3, §5 (sauf règles d'accès), §6, §9, §10 pour l'instant.
2. **Vérifie l'environnement** : `node -v` (22), `pnpm -v`, `docker compose version`, `flutter --version`. Note les versions dans `PROGRESS.md › Pièges connus`. Si un outil manque, note-le sous `## BLOQUÉ` avec la commande d'installation attendue, crée `.claude/BLOCKED` et arrête-toi : c'est une action humaine.
3. **Affine `PLAN.md`** (mode plan activé : lance `/plan` ou réfléchis avant d'écrire) :
   - Pour chaque tâche, vérifie que les IDs d'exigence existent dans le cahier des charges et que le critère de test est concret. Corrige, découpe les tâches trop grosses (> 1 session), ajoute les tâches manquantes pour couvrir **100 % des exigences « M »**. Une exigence « M » sans tâche = défaut de plan.
   - Produis `docs/dev/TRACEABILITY.md` : tableau `Exigence M | Tâche(s) PLAN | Test(s) prévus`. Aucune ligne vide.
   - N'ajoute rien au MVP qui ne soit « M ». Les « S/C » restent dans le backlog.
4. **Initialise le dépôt** : `git init` si besoin, `.gitignore`, premier commit `chore: bootstrap dev workflow (CLAUDE.md, plan, hooks)`. Vérifie que `bash scripts/hooks/stop-guard.sh` s'exécute sans erreur (`echo '{}' | bash scripts/hooks/stop-guard.sh`).
5. **Exécute la tâche P0-01** en suivant `/next`, pour valider toute la chaîne (hooks, tests, commit, reviewer).
6. Termine par `/handoff`.

## Règles de cette session

- Pose-moi au maximum 3 questions, uniquement sur des décisions irréversibles. Pour tout le reste, tranche, écris un ADR dans `DECISIONS.md`, continue.
- Ne lance pas d'implémentation au-delà de P0-01 : cette session sert à rendre la boucle autonome fiable.
- Utilise les sous-agents (`explorer`, `tester`, `reviewer`) plutôt que de lire ou d'exécuter toi-même ce qui produit beaucoup de texte.
