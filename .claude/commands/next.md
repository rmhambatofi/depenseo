---
model: sonnet
---
Prends la prochaine tâche du MVP.

1. Lis `docs/dev/PROGRESS.md` puis la première tâche `[ ]` de `docs/dev/PLAN.md` (hors backlog). Marque-la `[~]`.
2. Demande au sous-agent `explorer` les sections du cahier des charges et les fichiers du dépôt concernés par cette tâche. Lis seulement ceux-là.
3. Écris les tests d'abord (rouge), implémente (vert), refactore.
4. Lance le sous-agent `tester`. Corrige jusqu'au vert.
5. Lance le sous-agent `reviewer` sur le diff. Corrige les BLOQUANT et IMPORTANT.
6. Committe (`feat|fix|test|chore(scope): … (ID)`), marque la tâche `[x]`, mets à jour `PROGRESS.md` (état courant + pièges).
7. Si tu as fait 3 tâches dans cette session ou lu plus de ~15 fichiers : `/handoff`. Sinon, recommence au point 1.
