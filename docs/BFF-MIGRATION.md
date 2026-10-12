# API v2 como BFF do admin

## Fronteira e compatibilidade

`admin-tpe → api-v2 → banco compartilhado / filas existentes → consumidores legacy`

Tudo que o admin consome da TPE passa pelo BFF, incluindo páginas públicas e
server actions. Não há fallback HTTP para a legacy. A consulta de CEP da BrasilAPI
é uma integração externa independente e permanece como estava.

**Nenhum arquivo do repo `api` foi alterado.** Handlers HTTP antigos, crons,
consumidores SQS, DLQ/redrive, recursos Serverless, webhooks Z-API, shortener e
`/public/start/:id` permanecem na legacy. Não remover esses recursos no cutover.
O BFF publica notificações; não executa o consumidor do WhatsApp.

Prisma do api-v2 continua fonte da verdade. Não há alteração de schema, migration
ou cópia de dados nesta implementação. Nenhum teste desta etapa usa banco/AWS reais.

## Rotas portadas

| Método | Caminho | Acesso |
| --- | --- | --- |
| POST | `/auth/login` | público |
| POST | `/auth/login-code` | público |
| POST | `/auth/recover-password` | público |
| POST | `/auth/reset-password` | autenticado |
| GET | `/groups/:groupId/designations/week` | autenticado |
| GET | `/groups/:groupId/designations/week-details` | autenticado |
| GET | `/groups/:groupId/designations` | autenticado |
| GET | `/designations/:id` | autenticado |
| GET | `/designations/:id/participants` | público |
| GET | `/designations/:id/participants/:participantId` | público |
| POST | `/designations?groupId=...` | coordenador |
| POST | `/designations/:id/send` | autenticado |
| PATCH | `/designations/:id/cancel` | autenticado |
| PATCH | `/designations/:id/reopen` | autenticado |
| PATCH | `/designations/:id/points/:pointId` | autenticado |
| PATCH | `/designations/:id/optional` | autenticado |
| PUT | `/designations/:id/points/:pointId/participants` | autenticado |
| GET | `/participants?groupId=...` | autenticado |
| POST | `/designations/:designationId/participants/:participantId/incidences` | público |
| PUT | `/designations/:designationId/participants/:participantId/incidences/:incidentId` | público |
| DELETE | `/designations/:designationId/participants/:participantId/incidences/:incidentId` | autenticado |

DELETE de designação, petições/uploads, grupos, pontos, coordenação, fila de
espera, analytics e demais rotas já existentes no api-v2 continuam disponíveis.
GET `week?random=true` mantém o sorteio com persistência, apesar de ser GET.
`groupId`, `filter`, `dateFrom`, `dateTo`, bodies e formatos de leitura usados pelo
admin são mantidos. Listar participantes com `groupId` usa o formato legado;
sem `groupId`, o formato moderno do api-v2 permanece intacto.

## Diferenças explícitas

- Edições de pontos, faltas, cancelamento, reabertura, sorteio e status de envio
  são persistidos diretamente no banco, em vez de publicar o agregado inteiro
  na fila de atualização. Esse é um ajuste de implementação, não uma mudança
  de caminho/método. O consumidor de atualização e os produtores legacy
  permanecem intactos. Não alternar edições entre clientes antigos e o BFF:
  mensagens antigas do agregado ainda podem sobrescrever mudanças recentes.
- Reset de senha mantém o token de sessão do `login-code`, com `id`. Diferente
  do handler antigo, o BFF exige que o participante encontrado pelo telefone
  seja o titular do token; não permite redefinir senha de outra pessoa.
- Respostas de POST portadas usam 200, inclusive incidências (não 201 do Nest).
  Campo `optional` não booleano no envio continua sendo ignorado.
- Faltas são consultadas por designação/participante/incidentId. Conflitos de
  unicidade retornam erro de negócio, sem expor erro Prisma.
- Dupla homem+mulher é permitida, conforme decisão anterior do projeto.
  Avisos de participante sozinho/lotação continuam em `assignment.error`.
- Extensão **PUT `/designations/:id/participants`** aplica a sugestão inteira em
  uma leitura e uma transação. Body: `{ assignments: [{ pointId, participantIds }] }`.
  O endpoint unitário permanece para drag-and-drop. Evita N PUTs sequenciais no
  auto-assign. O último ponto solicitado ganha participantes repetidos; faltas
  abertas/ids fora do pool são filtrados. Ponto inválido rejeita o lote antes
  de gravar. Testes cobrem equivalência com o loop unitário.

## Configuração antes do deploy

1. BFF: `DATABASE_URL` do mesmo ambiente da legacy e `JWT_SECRET` compatível.
   O fallback antigo continua por compatibilidade; não trocar segredo apenas
   de um lado durante a transição.
2. Configurar **`WHATSAPP_MESSAGE_QUEUE`** com a URL da fila já existente nesse
   ambiente e credenciais/IAM com `sqs:SendMessage`. O BFF não cria a fila.
   `WHATSAPP_MESSAGE_DLQ` é opcional para o adaptador de DLQ; nenhum endpoint
   migrado publica nela diretamente. `AWS_REGION` deve corresponder à fila.
3. Configurar `FRONTEND_URL`, `API_URL` e `SHORT_LINK_DOMAIN` por ambiente.
   **`API_URL` é a base da legacy**, pois o link MINHA abre `/public/start/:id`.
   Não confiar no fallback `/dev` em HMG/produção. Short links são gravados na
   tabela compartilhada e redirecionados pelo serviço legacy.
4. Admin: definir `NEXT_PUBLIC_NEW_API_URL` com a URL do BFF antes do build.
   O default é homologação. `NEXT_PUBLIC_LEGACY_API_URL` não é mais utilizado.
   Browser usa `lib/api-client.ts`; server actions usam `lib/api-client.server.ts`
   com a mesma base. Cookies/localStorage existentes não foram removidos.
5. Publicar/configurar o BFF **antes** do admin. Validar recuperação, drag/drop,
   sorteio, envio, cancelamento, faltas e páginas públicas em ambiente isolado.
   Verificar permissões IAM, CORS e timezone America/Sao_Paulo nesse ambiente.

As cópias locais `.env.hmg` e `.env.prod` não têm `WHATSAPP_MESSAGE_QUEUE`,
`FRONTEND_URL`, `API_URL` ou `SHORT_LINK_DOMAIN`. Não foram editadas. O deploy
precisa fornecer esses valores; sem fila configurada, publicação falha
explicitamente. Não reutilizar fila de produção em testes.

## Verificação reproduzível e limites

No api-v2:

```sh
npm run build
npm run check:migration
npm run check:admin-routes
```

Build e ESLint dos arquivos TypeScript alterados passaram. Neste repo o ESLint
9 ainda usa `.eslintrc.js`: a validação foi executada com
`ESLINT_USE_FLAT_CONFIG=false`, sem migrar sua configuração.

- Scripts de paridade: hash/JWT 4, rotas de faltas 15, mapper 17, rotas de
  designação 71, escritas 27, envio 22 e sorteio 9 verificações.
- `check-bff-contract`: 63 verificações adicionais, usando controllers reais,
  AuthGuard/DTOs reais, AuthService e serviço de lote com banco/filas em memória.
  Exercita login-code → reset → login; autenticação pública/privada e lote.
- `check-designation-create`: cobre ausência de designação, grupo inexistente,
  grupo fechado/sem pontos, preservação do histórico e duas criações concorrentes
  usando um banco simulado com lock por grupo.
- `check-admin-routes`: inventário AST de chamadas `apiClient`/`serverApiClient`
  nos diretórios app/components/hooks/lib do repo irmão. Compara métodos e
  caminhos com decorators dos controllers reais. Não prova comportamento nem
  responses de cada rota moderna; URLs de variáveis são resolvidas por escopo
  e ramos condicionais, sem executar o app.
  Resultado local: 110 chamadas, 75 contratos método/caminho, nenhuma chamada
  não resolvida ou sem rota no BFF (83 rotas registradas).

No admin, o build Next passou. O typecheck completo continua falhando por
problemas anteriores: `lib/date-utils.ts` contém texto inválido para TypeScript.
Diagnóstico com esse arquivo omitido **somente da análise**, sem editar o repo:
74 erros no HEAD original, 71 na árvore atual, zero diagnósticos novos. Lint
não pôde rodar: `next lint` abre o assistente porque não há configuração ESLint.
Nenhum framework de testes/configuração lint foi adicionado ao admin.

Esses resultados são verificações locais isoladas, **não homologação com banco,
SQS ou WhatsApp reais**. Não houve deploy, push ou execução de migrations.

## Recuperação de grupo sem designação atual

GET da semana mantém HTTP 404, com `code: DESIGNATION_NOT_FOUND` e `groupStatus`
quando o grupo existe. Grupo inexistente usa `GROUP_NOT_FOUND`; o front só trata
o primeiro como estado vazio, sem toast de falha. Erros reais têm botão
**Tentar novamente**. Trocar de grupo limpa o estado e ignora respostas antigas.

Coordenadores veem **Criar designação** para um grupo aberto sem designação,
usando o POST existente, sem DELETE. O servidor valida o perfil atual com
RolesGuard, grupo aberto e pontos configurados. Uma transação ReadCommitted
obtém `SELECT ... FOR UPDATE` na linha do grupo antes de verificar designações
não arquivadas; isso serializa criações pelo BFF, sem migration. Se outra chamada
já criou, responde 409 e o front recarrega a designação existente. Histórico
arquivado não é excluído. Duplo clique também é bloqueado no cliente.

O lock protege chamadas de criação do BFF; o produtor legacy não participa
desse protocolo. Não executar criação simultânea pelo cron/handler antigo e
pelo BFF. O cron legacy permanece sem alterações nesta etapa.
