#!/usr/bin/env bash
# Injecte l'état courant dans le contexte au démarrage de chaque session (stdout = contexte ajouté).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rm -f "$ROOT/.claude/HANDOFF"
echo "=== ÉTAT DU PROJET (généré par scripts/hooks/session-start.sh) ==="
echo "--- docs/dev/PROGRESS.md ---"
# PROGRESS.md doit rester sous 10 Ko (limite d'injection du hook) : au-delà, la sortie est tronquée.
PROGRESS="$ROOT/docs/dev/PROGRESS.md"
SIZE=$(wc -c < "$PROGRESS" | tr -d ' ')
if [ "$SIZE" -gt 10240 ]; then
  head -c 8000 "$PROGRESS"
  echo
  echo "!!! PROGRESS.md fait $SIZE octets (> 10 Ko) : sortie tronquée. Déplace des pièges vers docs/dev/pieges/ et résume l'historique."
else
  cat "$PROGRESS"
fi
echo
echo "--- Tâches PLAN.md (hors backlog) ---"
sed '/<!-- backlog -->/,$d' "$ROOT/docs/dev/PLAN.md" | grep -E '^- \[( |~|!)\]' | head -n 12 | cut -c1-240 || true
echo
echo "--- git ---"
git -C "$ROOT" status --short | head -n 20 || true
git -C "$ROOT" log --oneline -n 5 2>/dev/null || true
if [ -f "$ROOT/.claude/BLOCKED" ]; then
  echo
  echo "!!! .claude/BLOCKED est présent : lis la section BLOQUÉ de PROGRESS.md. Supprime le fichier une fois le blocage levé."
fi
