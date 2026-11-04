#!/usr/bin/env bash
# Hook Stop : empêche Claude de terminer tant que le MVP n'est pas implémenté ET testé,
# sauf passation volontaire (.claude/HANDOFF) ou blocage déclaré (.claude/BLOCKED).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLAN="$ROOT/docs/dev/PLAN.md"

block() { printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$1" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(d)))')"; exit 0; }

# 1. Passation ou blocage volontaires : on laisse la session se terminer (la boucle externe relancera).
[ -f "$ROOT/.claude/HANDOFF" ] && exit 0
[ -f "$ROOT/.claude/BLOCKED" ] && exit 0

# 2. Travail non committé : interdit de s'arrêter.
if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
  block "Des modifications ne sont pas committées. Termine la tâche en cours, lance les tests, committe, mets à jour docs/dev/PROGRESS.md. Si tu veux passer la main à une session fraîche : écris le handoff dans PROGRESS.md puis crée le fichier .claude/HANDOFF."
fi

# 3. Tâche marquée en cours.
if sed '/<!-- backlog -->/,$d' "$PLAN" | grep -qE '^- \[~\]'; then
  block "Une tâche est marquée [~] dans docs/dev/PLAN.md. Termine-la (tests verts + commit) et marque-la [x], ou crée .claude/HANDOFF après avoir documenté l'état dans PROGRESS.md."
fi

# 4. Tâches restantes dans le MVP.
REMAINING="$(sed '/<!-- backlog -->/,$d' "$PLAN" | grep -cE '^- \[ \]' || true)"
if [ "${REMAINING:-0}" -gt 0 ]; then
  NEXT="$(sed '/<!-- backlog -->/,$d' "$PLAN" | grep -E '^- \[ \]' | head -n 1)"
  block "Le MVP n'est pas terminé : $REMAINING tâche(s) restante(s) dans docs/dev/PLAN.md. Prochaine : $NEXT — Lis PROGRESS.md, marque la tâche [~], implémente, teste, committe, marque [x], mets à jour PROGRESS.md. Si le contexte est lourd, fais une passation (.claude/HANDOFF) après avoir committé."
fi

# 5. Tout est coché : vérification finale que les tests passent.
if [ -f "$ROOT/package.json" ] && command -v pnpm >/dev/null; then
  if ! (cd "$ROOT" && pnpm -r --if-present typecheck >/dev/null 2>&1 && pnpm -r --if-present test >/dev/null 2>&1); then
    block "Toutes les tâches sont cochées mais 'pnpm -r typecheck' ou 'pnpm -r test' échoue. Corrige avant de terminer."
  fi
fi
exit 0
