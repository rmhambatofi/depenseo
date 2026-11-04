#!/usr/bin/env bash
# Bloque les commandes dangereuses avant exécution.
set -uo pipefail
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).tool_input?.command||"")}catch{console.log("")}})')"
if printf '%s' "$CMD" | grep -qE -- '--no-verify|git push .*--force|git reset --hard|rm -rf (/|~|\.)( |$)|DROP DATABASE|\.skip\(|\.only\('; then
  echo "Commande refusée par scripts/hooks/pre-bash.sh (règle CLAUDE.md) : $CMD" >&2
  exit 2
fi
exit 0
