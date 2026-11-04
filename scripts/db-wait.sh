#!/usr/bin/env bash
# Attend que le service `db` de docker-compose.yml soit prêt (healthcheck officiel MariaDB).
# Usage : scripts/db-wait.sh   (DB_WAIT_TIMEOUT en secondes, 60 par défaut)
set -euo pipefail
cd "$(dirname "$0")/.."

timeout="${DB_WAIT_TIMEOUT:-60}"
deadline=$((SECONDS + timeout))

until docker compose exec -T db healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; do
  if ((SECONDS >= deadline)); then
    echo "db-wait: MariaDB indisponible après ${timeout} s" >&2
    docker compose logs --tail 30 db >&2 || true
    exit 1
  fi
  sleep 1
done
echo "db-wait: MariaDB prête"
