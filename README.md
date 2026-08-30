<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).

## Ambientes

| Branch   | Imagem Docker Hub                | Compose local         | CI / Deploy |
|----------|----------------------------------|-----------------------|-------------|
| `master` | `wfelipe2011/tpe-prod:master`    | `docker-compose.yml`  | `.github/workflows/ci.yml` (push em `master`) |
| `hmg`    | `wfelipe2011/tpe-hmg:latest`     | `docker-compose.hmg.yml` | `.github/workflows/deploy.hmg.yml` (push em `hmg`, env `acceptance`) |
| dev      | build local via `Dockerfile.dev` | `docker-compose.dev.yml` | manual (`npm run start:docker:dev`) |

### Variáveis de ambiente

Copie `.env.example` para `.env` (dev) ou `.env.hmg` (acceptance) e preencha os valores. Os arquivos `.env*` estão no `.gitignore`.

```bash
cp .env.example .env
cp .env.example .env.hmg
```

### Rodar localmente

```bash
# dev (sem Docker)
npm install
npx prisma generate
npm run start:dev

# dev (com Docker)
npm run start:docker:dev
```

### Subir a stack HMG no Portainer

1. Garanta que o workflow `deploy.hmg.yml` rodou e publicou `wfelipe2011/tpe-hmg:latest`.
2. No Portainer, **Stacks → Add stack**, cole o conteúdo de `docker-compose.hmg.yml`.
3. Monte o arquivo `.env.hmg` no mesmo diretório da stack (ou injete as variáveis direto na UI).
4. Confirme a porta **7001** exposta no host (a compose mapeia `7001:7000`).
5. A rede `npm_public` precisa existir no host antes do deploy (`docker network create npm_public`).

### Secrets necessários no GitHub (environment `acceptance`)

- `DATABASE_URL`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `CLOUDFRONT_PETITION_URL`
- `DOCKER_USERNAME`, `DOCKER_PASSWORD`
- `HMG_IMAGE_NAME` (opcional; default `wfelipe2011/tpe-hmg`)
