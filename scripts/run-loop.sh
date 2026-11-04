#!/usr/bin/env bash
# Boucle autonome : relance Claude Code avec un contexte FRAIS tant que le MVP n'est pas terminé.
# Chaque itération lit l'état dans docs/dev/PROGRESS.md (hook SessionStart), fait ≤ 3 tâches, puis passe la main.
#
# Usage : bash scripts/run-loop.sh [max_sessions]   (défaut 60)
# Prérequis : claude installé et authentifié ; docker, pnpm, flutter disponibles ; 00-bootstrap déjà exécuté.
# Arrêt : MVP terminé (PLAN.md tout coché + tests verts), blocage (.claude/BLOCKED), ou max_sessions atteint.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MAX="${1:-60}"
LOG_DIR="$ROOT/.claude/logs"; mkdir -p "$LOG_DIR"
PROMPT_TPL="$ROOT/docs/prompts/01-session.md"

remaining() { sed '/<!-- backlog -->/,$d' docs/dev/PLAN.md | grep -cE '^- \[( |~)\]' || true; }

for i in $(seq 1 "$MAX"); do
  if [ -f .claude/BLOCKED ]; then
    echo "[$i] BLOQUÉ : lis docs/dev/PROGRESS.md › BLOQUÉ, lève le blocage, supprime .claude/BLOCKED, relance." ; exit 2
  fi
  LEFT="$(remaining)"
  if [ "${LEFT:-0}" -eq 0 ]; then
    echo "[$i] PLAN.md entièrement coché. Vérification finale des tests…"
    if pnpm -r --if-present typecheck && pnpm -r --if-present test; then echo "MVP terminé et testé."; exit 0; fi
    echo "Tests rouges : relance d'une session de correction."
  fi
  echo "=== Session $i — $LEFT tâche(s) restante(s) — $(date -Iseconds) ==="
  PROMPT="$(sed "s/\$SESSION/$i/g" "$PROMPT_TPL")"
  rm -f .claude/HANDOFF
  # --dangerously-skip-permissions : pas d'humain pour approuver ; les garde-fous sont dans settings.json (deny) + hooks.
  # Retire-le et ajoute --permission-mode acceptEdits si tu préfères approuver les commandes shell.
  claude -p "$PROMPT" \
    --dangerously-skip-permissions \
    --output-format text \
    --max-turns 400 \
    2>&1 | tee "$LOG_DIR/session-$(printf '%03d' "$i").log"
  # Petite pause : laisse le temps aux conteneurs/quotas et rend la boucle interruptible (Ctrl-C).
  sleep 5
done
echo "Maximum de $MAX sessions atteint. Reste : $(remaining) tâche(s)."; exit 1
