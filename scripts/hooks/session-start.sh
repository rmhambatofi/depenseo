#!/usr/bin/env bash
# Injecte l'état courant dans le contexte au démarrage de chaque session (stdout = contexte ajouté).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rm -f "$ROOT/.claude/HANDOFF"
echo "=== ÉTAT DU PROJET (généré par scripts/hooks/session-start.sh) ==="
echo "--- docs/dev/PROGRESS.md ---"
cat "$ROOT/docs/dev/PROGRESS.md"
echo
echo "--- Tâches PLAN.md (hors backlog) ---"
sed '/<!-- backlog -->/,$d' "$ROOT/docs/dev/PLAN.md" | grep -E '^- \[( |~|!)\]' | head -n 12 || true
echo
echo "--- git ---"
git -C "$ROOT" status --short | head -n 20 || true
git -C "$ROOT" log --oneline -n 5 2>/dev/null || true
if [ -f "$ROOT/.claude/BLOCKED" ]; then
  echo
  echo "!!! .claude/BLOCKED est présent : lis la section BLOQUÉ de PROGRESS.md. Supprime le fichier une fois le blocage levé."
fi
