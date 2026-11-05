#!/usr/bin/env bash
# NF-FMT-05 : rejoue les tests de dates mobiles sous les 4 fuseaux de l'hôte
# (Paris, Lisbonne, Montréal, La Réunion). Les calculs dépendent du fuseau du
# compte, jamais de celui de l'appareil : le résultat doit être identique.
# Usage : tool/test_tz.sh [arguments supplémentaires de flutter test]
set -euo pipefail
cd "$(dirname "$0")/.."
for zone in Europe/Paris Europe/Lisbon America/Montreal Indian/Reunion; do
  echo "=== TZ=$zone ==="
  TZ="$zone" flutter test --tags tz "$@"
done
