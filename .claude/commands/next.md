---
model: sonnet
---
Prends la prochaine tâche du MVP.

1. `docs/dev/PROGRESS.md` est déjà injecté par le hook SessionStart : ne le relis pas. Prends la première tâche `[ ]` de `docs/dev/PLAN.md` (hors backlog), marque-la `[~]`, puis lis **seulement** les fichiers de `docs/dev/pieges/` du domaine de la tâche (index dans PROGRESS.md ; ex. API → `api.md` + `api-tests.md`, + `api-db.md` si schéma ; mobile → `mobile.md` + `mobile-tests.md`).
2. Demande au sous-agent `explorer` les sections du cahier des charges et les fichiers du dépôt concernés par cette tâche. Lis seulement ceux-là.
3. Écris les tests d'abord (rouge), implémente (vert), refactore.
4. Lance le sous-agent `tester`. Corrige jusqu'au vert.
5. Lance le sous-agent `reviewer` sur le diff. Corrige les BLOQUANT et IMPORTANT.
6. Committe (`feat|fix|test|chore(scope): … (ID)`), marque la tâche `[x]`, mets à jour l'état courant de `PROGRESS.md` et ajoute les pièges rencontrés au fichier `docs/dev/pieges/<domaine>.md` concerné (seuls les pièges transverses vont dans PROGRESS.md, qui doit rester < 10 Ko).
7. Si tu as fait 3 tâches dans cette session ou lu plus de ~15 fichiers : `/handoff`. Sinon, recommence au point 1.
