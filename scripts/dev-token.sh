#!/usr/bin/env bash
#
# Gera um JWT válido para o ambiente de dev local.
#
# O guard da api-v2 (src/auth/auth.guard.ts) usa process.env.JWT_SECRET
# com fallback 'tpe-sorocaba'. Aqui seguimos o mesmo padrão: lemos do .env
# se existir, senão usamos o default. O payload mínimo precisa de um `id`
# de participant que existe no Postgres local restaurado (UUIDs preservados
# do dump HMG).
#
# Uso:
#   npm run dev:token                    # token 1d (default)
#   npm run dev:token -- 7d              # token 7d
#   npm run dev:token -- 30d ADMIN_ANALYST
#
# Variáveis:
#   DEV_PARTICIPANT_ID  - sobrescreve o participant UUID (default: COORDINATOR do dump)
#   JWT_SECRET          - sobrescreve o secret (default: lido do .env ou 'tpe-sorocaba')

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPIRES="${1:-1d}"
PROFILE="${2:-COORDINATOR}"

DEFAULT_UUID="38ce5ac6-c26c-4d7a-9d86-1df08289a1e5"
PARTICIPANT_ID="${DEV_PARTICIPANT_ID:-$DEFAULT_UUID}"

# Resolve secret: env > .env > default
if [ -z "${JWT_SECRET:-}" ] && [ -f .env ]; then
  JWT_SECRET="$(grep -E '^JWT_SECRET=' .env | cut -d= -f2- | tr -d '"' || true)"
fi
JWT_SECRET="${JWT_SECRET:-tpe-sorocaba}"

PARTICIPANT_ID="$PARTICIPANT_ID" \
PROFILE="$PROFILE" \
EXPIRES="$EXPIRES" \
JWT_SECRET="$JWT_SECRET" \
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    id: process.env.PARTICIPANT_ID,
    name: 'Dev User',
    profile: process.env.PROFILE,
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.EXPIRES }
);
console.log(token);
"
