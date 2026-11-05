#!/usr/bin/env bash
# Boucle autonome : relance Claude Code avec un contexte FRAIS tant que le MVP n'est pas terminé.
# Chaque itération lit l'état dans docs/dev/PROGRESS.md (hook SessionStart), fait ≤ 3 tâches, puis passe la main.
#
# Usage : bash scripts/run-loop.sh [max_sessions]   (défaut 60)
# Arrêt : MVP terminé (PLAN.md tout coché + tests verts), blocage (.claude/BLOCKED), authentification expirée,
#         3 sessions consécutives sans commit, ou max_sessions atteint.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MAX="${1:-60}"
LOG_DIR="$ROOT/.claude/logs"; mkdir -p "$LOG_DIR"
PROMPT_TPL="$ROOT/docs/prompts/01-session.md"
IDLE=0

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
  BEFORE="$(git rev-parse HEAD 2>/dev/null || echo none)"
  LOG="$LOG_DIR/session-$(printf '%03d' "$i").log"
  # --dangerously-skip-permissions : pas d'humain pour approuver ; les garde-fous sont dans settings.json (deny) + hooks.
  claude -p "$PROMPT" \
    --dangerously-skip-permissions \
    --output-format text \
    --max-turns 400 \
    2>&1 | tee "$LOG"

  # Authentification expirée : inutile de relancer, il faut `claude login`.
  if grep -qiE "Failed to authenticate|OAuth session expired|not logged in|Invalid API key" "$LOG"; then
    echo; echo "!!! Authentification expirée. Lance 'claude login' puis relance 'bash scripts/run-loop.sh'. Arrêt."
    exit 3
  fi
  # Session sans aucun commit : compteur de sessions à vide.
  AFTER="$(git rev-parse HEAD 2>/dev/null || echo none)"
  if [ "$BEFORE" = "$AFTER" ]; then
    IDLE=$((IDLE+1))
    echo "[$i] Aucun commit produit (sessions à vide consécutives : $IDLE/3)."
    if [ "$IDLE" -ge 3 ]; then
      echo "!!! 3 sessions sans commit : vérifie $LOG et docs/dev/PROGRESS.md. Arrêt."; exit 4
    fi
    sleep 60
  else
    IDLE=0
    sleep 5
  fi
done
echo "Maximum de $MAX sessions atteint. Reste : $(remaining) tâche(s)."; exit 1
