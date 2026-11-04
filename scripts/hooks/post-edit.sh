#!/usr/bin/env bash
# Après chaque Edit/Write : formatage + vérifications rapides sur le fichier touché. Non bloquant sauf violation d'invariant.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.tool_input?.file_path||"")}catch{console.log("")}})')"
[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.ts|*.tsx)
    [ -x "$ROOT/node_modules/.bin/prettier" ] && "$ROOT/node_modules/.bin/prettier" --log-level silent --write "$FILE" || true
    # Invariants dates / montants (CLAUDE.md §Invariants)
    if grep -nE "new Date\(['\"][0-9]{4}-[0-9]{2}-[0-9]{2}['\"]\)" "$FILE" >/dev/null; then
      echo "INVARIANT VIOLÉ dans $FILE : new Date('AAAA-MM-JJ') interdit sur une date calendaire (NF-FMT-08). Utilise CalendarDate / Temporal.PlainDate." >&2
      exit 2
    fi
    if grep -nEi "(float|double)\(" "$FILE" >/dev/null && echo "$FILE" | grep -q "schema"; then
      echo "INVARIANT VIOLÉ dans $FILE : FLOAT/DOUBLE interdits en base (NF-FMT-01). Montants en BIGINT centimes, taux en DECIMAL(18,8)." >&2
      exit 2
    fi
    ;;
  *.sql)
    if grep -nEi "\b(FLOAT|DOUBLE|TIMESTAMP)\b" "$FILE" >/dev/null; then
      echo "INVARIANT VIOLÉ dans $FILE : FLOAT/DOUBLE/TIMESTAMP interdits (NF-FMT-01, §8.2). Utilise BIGINT, DECIMAL(18,8), DATETIME(3)." >&2
      exit 2
    fi
    if grep -nE "CHARSET=utf8\b|utf8_general|utf8_unicode" "$FILE" >/dev/null; then
      echo "INVARIANT VIOLÉ dans $FILE : encodage utf8 (3 octets) interdit. utf8mb4 / utf8mb4_unicode_520_ci." >&2
      exit 2
    fi
    ;;
  *.dart)
    command -v dart >/dev/null && dart format "$FILE" >/dev/null 2>&1 || true
    ;;
esac
exit 0
