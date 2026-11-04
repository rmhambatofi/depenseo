# Kit Claude Code — implémentation autonome de Depenseo

Ce kit transforme le cahier des charges en une boucle d'implémentation **autonome, reprenable et à contexte maîtrisé**. Il applique les recommandations d'Anthropic pour Claude Code : mémoire projet courte dans `CLAUDE.md`, état persistant dans des fichiers plutôt que dans le contexte, sessions courtes relancées avec un contexte frais, sous-agents pour l'exploration / les tests / la relecture, hooks déterministes pour ce qui ne doit jamais dépendre d'une instruction, et explore → plan → code → test → commit.

## Contenu

| Fichier | Rôle |
|---|---|
| `CLAUDE.md` | Mémoire projet : stack, invariants (dates, montants, MariaDB), commandes, protocole de session. ~100 lignes, volontairement. |
| `docs/dev/PLAN.md` | Plan de travail : 7 phases, ~55 tâches, chacune liée à des IDs d'exigence « M » et à un critère de test. Le hook Stop compte les `[ ]`. |
| `docs/dev/PROGRESS.md` | **Seul état transmis** entre sessions : tâche courante, pièges, blocages. |
| `docs/dev/DECISIONS.md` | ADR : chaque ambiguïté tranchée est consignée. |
| `docs/prompts/00-bootstrap.md` | Prompt de la première session (interactive) : valide l'environnement, affine le plan, fait P0-01. |
| `docs/prompts/01-session.md` | Prompt relancé à chaque session autonome. |
| `.claude/settings.json` | Permissions (allow/deny) et hooks. |
| `scripts/hooks/session-start.sh` | Injecte PROGRESS.md + tâches ouvertes + git au démarrage : la session n'a rien à relire. |
| `scripts/hooks/post-edit.sh` | Formate et **bloque** les violations d'invariants (`new Date('AAAA-MM-JJ')`, FLOAT, utf8…). |
| `scripts/hooks/pre-bash.sh` | Refuse `--no-verify`, `git push --force`, `.skip(`, etc. |
| `scripts/hooks/stop-guard.sh` | **Hook Stop** : Claude ne peut pas terminer tant que le MVP n'est pas coché et testé, sauf passation (`.claude/HANDOFF`) ou blocage (`.claude/BLOCKED`). |
| `.claude/agents/{explorer,tester,reviewer}.md` | Sous-agents à contexte isolé. |
| `.claude/commands/{next,handoff,status}.md` | Commandes `/next`, `/handoff`, `/status`. |
| `scripts/run-loop.sh` | Boucle externe : relance `claude -p` avec un contexte frais jusqu'à la fin. |

## Installation

```bash
git clone https://github.com/rmhambatofi/depenseo && cd depenseo
# copier le contenu du kit à la racine du dépôt (CLAUDE.md, .claude/, scripts/, docs/dev/, docs/prompts/)
cp -r /chemin/vers/depenseo-kit/. .
chmod +x scripts/*.sh scripts/hooks/*.sh
```

## Utilisation

**1. Amorçage (une fois, interactif)**

```bash
claude
> $(cat docs/prompts/00-bootstrap.md)     # ou colle le contenu du fichier
```

Cette session vérifie l'environnement, affine `PLAN.md`, crée `TRACEABILITY.md`, réalise P0-01 pour valider la chaîne, puis fait `/handoff`.

**2. Boucle autonome**

```bash
bash scripts/run-loop.sh          # jusqu'à 60 sessions
```

Chaque session : contexte frais → lit l'état injecté → `/next` × ≤ 3 → `/handoff`. Le hook Stop empêche toute fin prématurée. La boucle s'arrête quand `PLAN.md` est entièrement coché et que `pnpm -r test` est vert, ou sur `.claude/BLOCKED`.

**3. Suivi**

```bash
claude -p "/status"               # résumé en 10 lignes
tail -f .claude/logs/session-*.log
cat docs/dev/PROGRESS.md
```

Si `.claude/BLOCKED` apparaît : lis `PROGRESS.md › BLOQUÉ`, agis (secret, outil, décision), supprime le fichier, relance la boucle.

## Pourquoi ces choix

- **Sessions courtes relancées** plutôt qu'une session infinie : Anthropic rappelle que la qualité baisse quand le contexte se remplit ; `/compact` perd de l'information, un redémarrage avec un état en fichiers n'en perd pas.
- **Hook Stop** plutôt qu'une instruction « ne t'arrête pas » : les instructions sont consultatives, les hooks sont déterministes.
- **Reviewer en contexte frais** : un relecteur qui n'a pas écrit le code n'est pas biaisé en sa faveur.
- **Invariants vérifiés par hook** : les deux défauts fatals du cahier des charges (dates décalées, montants ×100) ne peuvent plus passer par inadvertance.
- **`--dangerously-skip-permissions` encadré** : nécessaire sans humain, mais compensé par la liste `deny`, `pre-bash.sh`, et l'exécution recommandée dans un conteneur ou une VM dédiée.

## Ajuster

- Rythme : `3 tâches / 15 fichiers` par session dans `CLAUDE.md`, `/next` et `01-session.md`.
- Périmètre : déplace une tâche sous `<!-- backlog -->` pour la sortir de la boucle.
- Modèle : `model: haiku` sur `explorer` pour économiser ; `opus` sur `reviewer` pour durcir.
