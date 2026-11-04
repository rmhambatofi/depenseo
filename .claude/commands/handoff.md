Prépare la passation à une session fraîche (optimisation du contexte).

Conditions : aucune tâche `[~]`, `git status` propre, tests verts. Sinon termine d'abord.

1. Réécris la section « État courant » de `docs/dev/PROGRESS.md` : tâche suivante, dernier commit, résultat des tests.
2. Ajoute à « Pièges connus » tout ce qu'une session fraîche doit savoir pour ne pas refaire tes erreurs (versions, erreurs CI, config). Supprime ce qui est devenu obsolète.
3. Ajoute une ligne datée dans « Historique » (garde ≤ 10 lignes).
4. Committe : `chore(dev): handoff after <ID>`.
5. Crée le fichier `.claude/HANDOFF` (`touch .claude/HANDOFF`) puis termine ta réponse par une phrase : « Handoff prêt, prochaine tâche <ID>. »
