.PHONY: help dev-full dev-setup dev dev-reset dev-down dev-logs

help: ## Mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev-full: dev-setup dev ## Setup completo + start (primeira vez)

dev-setup: ## Cria .env, sobe Postgres, restaura dump, gera Prisma client
	@npm run dev:setup

dev: ## Sobe a API em http://localhost:3000 (Docker)
	@npm run dev

dev-down: ## Para containers de dev
	docker compose -f docker-compose.dev.yml down

dev-reset: ## Apaga volume do Postgres e refaz o setup
	@npm run dev:reset

dev-logs: ## Tail dos logs da API
	docker compose -f docker-compose.dev.yml logs -f tpe-dev
