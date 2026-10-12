/**
 * Fase 2 (incidências): confirma que as 3 rotas migradas registram nos mesmos caminhos da
 * legacy e que o AuthGuard se comporta como cada rota precisa.
 *
 * Sobe um app Nest real (só com o controller de faltas + AuthGuard global, sem banco) e
 * chama por HTTP de verdade. Rodar: `npx ts-node -T scripts/check-incident-routes.ts`
 *
 * Não usa jest de propósito: o jest.config do projeto já tem `testRegex` e este script é
 * uma verificação pontual, não parte da suíte.
 */
import { INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '../src/auth/auth.guard';
import { DesignationIncidentsController } from '../src/modules/incidents/designation-incidents.controller';
import { IncidentsService } from '../src/modules/incidents/incidents.service';

const SECRET = process.env.JWT_SECRET || 'tpe-sorocaba';
process.env.JWT_SECRET = SECRET;

type Call = { name: string; args: unknown[] };
const CALLS: Call[] = [];

@Injectable()
class StubIncidentsService {
  create(...args: unknown[]) {
    CALLS.push({ name: 'create', args });
    return { message: 'Incidente criado com sucesso' };
  }
  update(...args: unknown[]) {
    CALLS.push({ name: 'update', args });
    return { message: 'Incidente atualizado com sucesso' };
  }
  remove(...args: unknown[]) {
    CALLS.push({ name: 'remove', args });
    return { message: 'Incidente deletado com sucesso' };
  }
}

let results = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  results++;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Rotas registradas, só para imprimir. Best-effort: a prova é o comportamento HTTP. */
function dumpRoutes(app: INestApplication) {
  try {
    const server = app.getHttpAdapter().getInstance();
    const stack = server?._router?.stack ?? server?.router?.stack ?? [];
    const routes: string[] = [];
    for (const layer of stack) {
      if (!layer?.route) continue;
      for (const m of Object.keys(layer.route.methods ?? {})) {
        routes.push(`${m.toUpperCase()} ${layer.route.path}`);
      }
    }
    const inc = routes.filter((r) => r.includes('incidences')).sort();
    if (inc.length) {
      console.log('\n  rotas de falta registradas:');
      for (const r of inc) console.log(`    ${r}`);
    }
  } catch {
    /* introspecção é opcional */
  }
}

async function main() {
  const moduleRef = await Test.createTestingModule({
    controllers: [DesignationIncidentsController],
    providers: [
      { provide: IncidentsService, useClass: StubIncidentsService },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: Reflector, useValue: new Reflector() },
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  // mesma config do main.ts, senão os DTOs não são validados e o teste passa a toa
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const token = jwt.sign({ id: 'cap-1', name: 'Capitão', profile: 'CAPTAIN' }, SECRET, { expiresIn: '1h' });
  const BASE = '/designations/design-1/participants/part-1/incidences';
  const http = () => request(app.getHttpServer());

  dumpRoutes(app);

  console.log('\n  POST sem token — o voluntário reporta a própria falta');
  CALLS.length = 0;
  let res = await http().post(BASE).send({ reason: 'Consulta médica' });
  check('rota existe e é pública (200)', res.status === 200, `status=${res.status}`);
  check('mensagem da legacy preservada', res.body?.message === 'Incidente criado com sucesso', JSON.stringify(res.body));
  check('reporter cai para o próprio participante (sem token)', CALLS[0]?.args?.[3] === undefined, `actor=${JSON.stringify(CALLS[0]?.args?.[3])}`);

  console.log('\n  POST com token — capitão logado vira o reporter');
  CALLS.length = 0;
  res = await http().post(BASE).set('Authorization', `Bearer ${token}`).send({ reason: 'Consulta médica' });
  check('rota aceita token (200)', res.status === 200, `status=${res.status}`);
  check('actor = id do token', (CALLS[0]?.args?.[3] as any)?.id === 'cap-1', `actor=${JSON.stringify((CALLS[0]?.args?.[3] as any)?.id)}`);

  console.log('\n  POST com token inválido — rota pública não pode quebrar');
  CALLS.length = 0;
  res = await http().post(BASE).set('Authorization', 'Bearer token.invalido').send({ reason: 'Consulta médica' });
  check('segue como anônimo (200)', res.status === 200, `status=${res.status}`);
  check('sem actor', CALLS[0]?.args?.[3] === undefined);

  console.log('\n  validação de body');
  res = await http().post(BASE).send({});
  check('POST sem motivo = 400', res.status === 400, `status=${res.status}`);
  res = await http().post(BASE).send({ reason: 'ab' });
  check('motivo curto demais = 400', res.status === 400, `status=${res.status}`);
  CALLS.length = 0;
  res = await http().put(`${BASE}/inc-1`).send({ status: 'STATUS_INVENTADO' });
  check('PUT com status fora do enum = 400', res.status === 400, `status=${res.status}`);

  console.log('\n  PUT é público, DELETE exige token (como na legacy)');
  CALLS.length = 0;
  res = await http().put(`${BASE}/inc-1`).send({ reason: 'Mudou de ideia' });
  check('PUT sem token passa (200)', res.status === 200, `status=${res.status}`);
  check('PUT chega no service', CALLS[0]?.name === 'update');

  res = await http().delete(`${BASE}/inc-1`);
  check('DELETE sem token = 401', res.status === 401, `status=${res.status}`);
  CALLS.length = 0;
  res = await http().delete(`${BASE}/inc-1`).set('Authorization', `Bearer ${token}`);
  check('DELETE com token passa (200)', res.status === 200, `status=${res.status}`);
  check('DELETE chega no service', CALLS[0]?.name === 'remove');

  await app.close();

  console.log(`\n${results - failures}/${results} conferências ok`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
