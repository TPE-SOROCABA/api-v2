# AGENTS.md

> Contexto para agentes (e devs juniores) que vão trabalhar neste repo.
> Foco em fatos verificáveis que não estão óbvios nos arquivos.

## Quick start (3 comandos)

```bash
npm install
npm run dev:setup    # primeira vez: .env + Postgres + restore dump HMG + Prisma
npm run dev          # API em http://localhost:3001
```

## Antes de implementar: existe na legacy?

**Esta é uma API v2 reescrita em NestJS. Muitas features já vivem na API legacy (`tpe/api/`) em Serverless Framework.**

🔗 **Antes de criar módulo, rota, utilitário ou migrar lógica: pesquise em https://github.com/TPE-SOROCABA/api (clone local em `../api/`) — pode já existir lá com testes e casos tratados.**

Exemplos do que vive na legacy e **não duplicar** aqui:
- Auth completo: `src/functions/auth/` (login, login-code, recover-password, reset-password)
- Authorizer Lambda: `src/functions/auth/checkAuthorizer.ts`
- Cron de designações: `src/functions/designations/` (12+ handlers)
- Webhooks, WhatsApp, shortener (`sls-shortener.yml`)
- Repositórios e mappers em `src/repositories/`, `src/mappers/`

Se algo já existe lá e aqui está incompleto, o caminho é **portar** (não reinventar).

---

## Dev environment

### Stack local (Docker, tudo dentro deste repo)

| Serviço | Imagem | Host port | Container |
|---|---|---|---|
| Postgres | `postgres:16-alpine` | **5433** | 5432 (5432 do host já está em uso) |
| API (NestJS) | build local | **3001** | 3000 (3000 do host já está em uso) |

Conexões:
- Da máquina (DBeaver, Prisma Studio): `localhost:5433`, user `tpe`, pass `tpe`, db `tpedigital`
- Do container da API: `postgres:5432` (rede Docker, não precisa de porta mapeada)

### Scripts npm úteis

| Comando | O que faz |
|---|---|
| `npm run dev:setup` | one-time: `.env` + Postgres + restore dump + Prisma generate |
| `npm run dev` | sobe API em foreground (Docker) |
| `npm run dev:reset` | apaga volume + refaz setup |
| `npm run db:restore` | só restaura dump (idempotente) |
| `npm run dev:token` | gera JWT válido para dev (ver Auth abaixo) |
| `npm run build` | `nest build` (SWC + tsc typecheck, ~10s) |
| `npm run lint` | ESLint + Prettier autofix |

Atalhos via Makefile: `make dev-full`, `make dev-setup`, `make dev`, `make dev-reset`, `make dev-logs`, `make dev-token ARGS="7d COORDINATOR"`.

### Variáveis de ambiente

Template versionado: **`.env.dev.example`** (copie para `.env` — o `dev-setup.sh` faz isso automaticamente).

Chaves que o app consome (`process.env.X` direto, **não há `@nestjs/config`**):
- `DATABASE_URL` — Postgres. `localhost:5433` no host, `postgres:5432` no compose.
- `JWT_SECRET` — fallback `'tpe-sorocaba'`. **Default intencional** para que tokens da legacy (`api/.env.acp`) sejam aceitos.
- `PORT` (default 3000), `NODE_ENV`, `TZ=America/Sao_Paulo` (forçado em `main.ts:2`).
- `AWS_*`, `CLOUDFRONT_PETITION_URL` — vazios por padrão; rotas de upload/CloudFront só funcionam após preencher.
- `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` — vazios por padrão; usados pelo `FirebaseService` para storage.

---

## Auth em dev

**Não existe `@Public()` decorator.** O guard é global (`APP_GUARD` em `src/app.module.ts`). Para qualquer rota nova, ela exige JWT automaticamente.

### Como obter um token válido local

```bash
npm run --silent dev:token                          # token 1d, profile COORDINATOR
TOKEN=$(npm run --silent dev:token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/congregations
```

O script (`scripts/dev-token.sh`) gera JWT com:
- `secret` = `JWT_SECRET` env > `.env` > fallback `'tpe-sorocaba'`
- `id` = UUID de participant real do dump HMG (`38ce5ac6-...`)
- profile configurável: `COORDINATOR`, `ADMIN_ANALYST`, etc.

Override do participant:
```bash
DEV_PARTICIPANT_ID="<outro-uuid-do-banco-local>" npm run dev:token
```

### Compatibilidade com a legacy

Tokens emitidos pela legacy (`api.tpedigital.com.br/hmg/auth/login`) **funcionam aqui** porque ambos compartilham o mesmo `JWT_SECRET=tpe-sorocaba` e o mesmo formato de payload. Mas a tabela `auths` no dump só tem 1 linha (com sentinel `!NEEDS_RESET!`), então **login real não funciona** — por isso o `dev:token` existe.

### Payload esperado

```ts
// src/shared/types/jwt.types.ts
{ id, name, profile, cpf?, profile_photo?, groupId?, designation? }
```

O guard **não consulta o banco** — só verifica a assinatura.

---

## Banco de dados

### Dump versionado

- Caminho: `db/dumps/hmg_latest.sql` (1 MB, **commitado no repo**)
- Formato: ASCII `pg_dump` 16.14
- 18 tabelas Prisma + `_prisma_migrations` (~190 rows históricas)
- Restauração via `docker exec` + `psql`, não requer `psql` no host

### Restore manual (idempotente)

```bash
docker exec -e PGPASSWORD=tpe pg-tpe-dev \
  psql -U tpe -d tpedigital \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker exec -i -e PGPASSWORD=tpe pg-tpe-dev \
  psql -U tpe -d tpedigital -v ON_ERROR_STOP=1 < db/dumps/hmg_latest.sql
```

### Migrações

- 39 migrations em `prisma/migrations/`. **NÃO precisa `prisma migrate deploy` no dev** — o dump já tem `_prisma_migrations` populado.
- Para criar nova migration: `npx prisma migrate dev --name <descritivo>` (cuidado: dump restaurado sobrescreve tudo se rodar `db:restore`).

---

## Testing — realidade

| Comando | Estado |
|---|---|
| `npm run test` | **passa com 0 testes**. Jest configurado mas `src/**/*.spec.ts` está vazio. |
| `npm run test:e2e` | **falha de fábrica**. `test/app.e2e-spec.ts:22` espera `'Hello World!'` em `GET /`, mas essa rota não existe. |
| `npm run build` | é o typecheck real (SWC + `typeCheck: true` no `nest-cli.json`) |

**Não confie em CI/CD existente** — workflows (`ci.yml`, `deploy.hmg.yml`) só publicam Docker images. Não rodam lint, typecheck ou tests.

Quando criar testes: o padrão está em `test/groups-cron.e2e-spec.ts` (385 linhas, com setup/cleanup completos).

---

## Estrutura do código

```
src/
├── auth/auth.guard.ts                 # JWT guard global, sem @Public()
├── infra/
│   ├── prisma/                        # PrismaService @Global + exception filter + interceptors
│   ├── firebase.service.ts            # Storage only, NÃO é auth
│   ├── ocr.service.ts
│   ├── transaction.{context,logger}.ts
│   └── error.interceptor.ts.ts        # ⚠️ ORPHAN: extensão dupla, código morto, não importar
├── middleware/
│   ├── transaction.middleware.ts      # AsyncLocalStorage UUID por request
│   └── logging-time.middleware.ts
├── modules/
│   ├── congregations/                 # controller + service + geo-location.service
│   ├── dashboard/
│   ├── designations/
│   ├── groups/                        # 2 controllers (groups + groups-participants)
│   ├── participants/
│   ├── petitions/                     # upload PDF + OCR
│   └── points/
├── shared/{dto,types}/                # jwt.types.ts, etc.
├── app.{controller,module}.ts
└── main.ts                            # ValidationPipe global, PrismaExceptionFilter global
```

### Convenções

- Módulos no **singular** (`participants/`, não `participants/`).
- Arquivos **kebab-case** (`find-all-participants.params.ts`).
- `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.usecase.ts`, `*.entity.ts`, `*.dto.ts`.
- Use `TransactionLogger` ou `Logger` do Nest, **nunca `console.log`** (13 ocorrências indevidas em `groups.service.ts`).
- Logging por request tem UUID em `x-transaction-id` (header de request e response).

---

## Git workflow

### Branches

| Branch | Deploy | Protegida |
|---|---|---|
| `master` | prod (`wfelipe2011/tpe-prod:master`) | **PR + 1 aprovação obrigatório** (`enforce_admins: true`) |
| `hmg` | acceptance (`wfelipe2011/tpe-hmg:latest`) via Portainer | não protegida |

Push direto em `master` é bloqueado pelo GitHub. Use PR.

### Commits

Estilo misto no histórico — siga conventional commits:
- `feat(escopo): descrição em PT`
- `fix(escopo): ...`
- `chore(escopo): ...`
- Escopo `(hmg)` quando a mudança é específica do ambiente de homologação.

---

## Gotchas que vão morder

1. **`error.interceptor.ts.ts`** (extensão dupla) — código morto, **não importar**. Foi comentado em `main.ts:20`.
2. **`toggleAdminAnalyst`** (`participants.controller.ts:46`) — rota **sem guard de ambiente**. Qualquer JWT válido promove qualquer participante. Não usar em prod sem refatorar.
3. **`auth.guard.ts:19`** loga `JSON.stringify(payload)` a cada request autenticada — expõe id/name/cpf. Remover antes de prod.
4. **Cron decorators importados mas comentados** em `groups.service.ts:7` e `congregations.service.ts:25`. `ScheduleModule.forRoot()` está registrado mas **nenhum job roda**. Não presuma que há cron.
5. **`@UseGuards(AuthGuard)` redundante** em `groups.controller.ts:22`, `designations.controller.ts:17`, `points.controller.ts:23` — `APP_GUARD` é global, esses decorators são no-op.
6. **`/health-check` é "público" só pelo middleware** (`prisma-connection.middleware.ts:67` hardcoded). Se o handler algum dia precisar de DB, o guard vai pedir token. Não confiar.
7. **`tsconfig.json` deliberadamente frouxo**: `strictNullChecks: false`, `noImplicitAny: false`. Código existente abusa de `: any` (22 ocorrências) — não seguir o mau exemplo.
8. **Prettier `printWidth: 180`** — linhas podem passar de 180 chars sem reformatar.
9. **`NODE_ENV=dev`** (typo) em `.env.hmg` e `.env.prod`. Provavelmente inofensivo mas pode confundir health checks.
10. **Firebase é só storage** — não é auth. Init lê config do banco (`prisma.firebase.findFirst()`), então roda sem env vars preenchidas.

---

## CI/CD

| Workflow | Trigger | O que faz |
|---|---|---|
| `ci.yml` | push `master` | build + push `wfelipe2011/tpe-prod` (Docker Hub) |
| `deploy.hmg.yml` | push `hmg` | build + push `wfelipe2011/tpe-hmg` (Docker Hub) |

Secrets GitHub (environment `acceptance`): `DATABASE_URL`, `AWS_*`, `CLOUDFRONT_PETITION_URL`, `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `HMG_IMAGE_NAME`.

**Não** rodam lint/typecheck/tests — esses ficam por conta do dev local.

---

## Dúvidas, problemas ou decisões

- Documentação interna: este `AGENTS.md` + `README.md` (ambientes/Portainer) + `prisma/README.md` (gotcha de migration).
- Dúvidas de auth/JWT: ver `api/src/domain/Login.ts` na legacy.
- Dúvidas de design de domínio (Participants, Petitions, Designations): ver `api/src/domain/` e `api/src/repositories/`.
- Mudanças que tocam múltiplos módulos: comece pelo repositório correspondente na legacy (`api/src/functions/<dominio>/`).
