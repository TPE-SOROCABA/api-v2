#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "================================================"
echo " TPE api-v2 — Dev Setup"
echo "================================================"
echo ""

echo "→ [1/4] Verificando .env"
if [ ! -f .env ]; then
  cp .env.dev.example .env
  echo "   ✓ Criado .env a partir de .env.dev.example"
  echo "   ! Preencha AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, FIREBASE_* quando precisar"
else
  echo "   ✓ .env já existe"
fi

echo ""
echo "→ [2/4] Subindo Postgres (Docker)"
docker compose -f docker-compose.dev.yml up -d postgres

echo ""
echo "→ [3/4] Aguardando healthcheck do Postgres..."
RETRIES=30
until [ "$(docker inspect --format='{{.State.Health.Status}}' pg-tpe-dev 2>/dev/null)" = "healthy" ]; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "   ✗ Postgres não ficou healthy em 30s"
    echo "   Verifique: docker logs pg-tpe-dev"
    exit 1
  fi
  sleep 1
done
echo "   ✓ Postgres healthy"

echo ""
echo "→ [4/4] Restaurando dump HMG"
bash scripts/db-restore.sh

echo ""
echo "→ Gerando Prisma Client"
npx prisma generate

echo ""
echo "================================================"
echo " ✓ Setup concluído"
echo "================================================"
echo ""
echo " Próximos passos:"
echo "   npm run dev          # sobe a API em http://localhost:3000 (Docker)"
echo "   npm run start:dev    # alternativa: app no host"
echo ""
echo " Resetar banco: npm run dev:reset"
echo ""
