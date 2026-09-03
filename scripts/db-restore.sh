#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${ROOT}/db/dumps/hmg_latest.sql"

if [ ! -f "$DUMP" ]; then
  echo "✗ Dump não encontrado em: $DUMP"
  echo "  Coloque o arquivo pg_dump em db/dumps/hmg_latest.sql"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q '^pg-tpe-dev$'; then
  echo "✗ Container pg-tpe-dev não está rodando."
  echo "  Rode: docker compose -f docker-compose.dev.yml up -d postgres"
  exit 1
fi

echo "   Dropando schema public..."
docker exec -e PGPASSWORD=tpe pg-tpe-dev \
  psql -U tpe -d tpedigital \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
  > /dev/null

echo "   Importando $DUMP..."
docker exec -i -e PGPASSWORD=tpe pg-tpe-dev \
  psql -U tpe -d tpedigital -v ON_ERROR_STOP=1 \
  < "$DUMP" > /tmp/db-restore.log 2>&1

echo "   ✓ Dump restaurado ($(wc -l < "$DUMP") linhas)"
echo "   Log: /tmp/db-restore.log"
