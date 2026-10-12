/**
 * Verifica o registro das rotas de leitura de designação e o comportamento dos
 * guards, sem tocar no banco.
 *
 * Rodar: npx ts-node -T -r tsconfig-paths/register scripts/check-designation-routes.ts
 */
import 'reflect-metadata';

import { Body, Controller, Get, HttpCode, HttpStatus, INestApplication, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AuthGuard } from '../src/auth/auth.guard';
import { IS_PUBLIC_KEY, Public } from '../src/auth/public.decorator';
import { DesignationsController } from '../src/modules/designations/designations.controller';
import { DesignationsService } from '../src/modules/designations/designations.service';
import { DesignationViewService } from '../src/modules/designations/designation-view.service';
import { GroupsDesignationsController } from '../src/modules/designations/groups-designations.controller';
import {
  CancelDesignationDto,
  CreateDesignationQuery,
  SendDesignationDto,
  UpdateMandatoryPresenceDto,
  UpdatePointParticipantsDto,
  UpdatePointStatusDto,
} from '../src/modules/designations/dto/designation-write.dto';

const GROUP = '11111111-1111-4111-8111-111111111111';
const DESIGNATION = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT = '33333333-3333-4333-8333-333333333333';
const POINT = '55555555-5555-4555-8555-555555555555';

let ok = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    ok++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FALHA ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

/**
 * Réplica mínima dos controllers com o MESMOBinding de rota e os mesmos guards —
 * importar os controllers reais puxaria o PrismaService e o Firebase.
 */
@Controller('groups')
class ProbeGroupsController {
  @Get(':groupId/designations/week')
  @UseGuards(AuthGuard)
  week(@Param('groupId', ParseUUIDPipe) _g: string, @Query('filter') f?: string) {
    return { rota: 'week', filter: f ?? null };
  }

  @Get(':groupId/designations/week-details')
  @UseGuards(AuthGuard)
  weekDetails() {
    return { rota: 'week-details' };
  }

  @Get(':groupId/designations')
  @UseGuards(AuthGuard)
  history() {
    return { rota: 'history' };
  }
}

@Controller('designations')
@UseGuards(AuthGuard)
class ProbeDesignationsController {
  @Get(':id')
  findOne() {
    return { rota: 'by-id' };
  }

  @Public()
  @Get(':id/participants')
  participants(@Param('id', ParseUUIDPipe) id: string) {
    return { rota: 'participants', id };
  }

  @Public()
  @Get(':id/participants/:participantId')
  participantDesignation(@Param('id', ParseUUIDPipe) id: string, @Param('participantId') pid: string) {
    return { rota: 'participant', id, pid };
  }

  // ---- escrita (Fase 4) ----
  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Query() q: CreateDesignationQuery) {
    return { rota: 'create', groupId: q.groupId };
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDesignationDto) {
    return { rota: 'cancel', id, dto };
  }

  @Patch(':id/reopen')
  reopen(@Param('id', ParseUUIDPipe) id: string) {
    return { rota: 'reopen', id };
  }

  @Patch(':id/points/:pointId')
  updatePointStatus(@Param('id', ParseUUIDPipe) id: string, @Param('pointId') pointId: string, @Body() dto: UpdatePointStatusDto) {
    return { rota: 'point-status', id, pointId, dto };
  }

  @Patch(':id/optional')
  optional(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMandatoryPresenceDto) {
    return { rota: 'optional', id, dto };
  }

  @Put(':id/points/:pointId/participants')
  participantsOfPoint(@Param('id', ParseUUIDPipe) id: string, @Param('pointId') pointId: string, @Body() dto: UpdatePointParticipantsDto) {
    return { rota: 'point-participants', id, pointId, dto };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  send(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendDesignationDto) {
    return { rota: 'send', id, dto };
  }
}

@Module({ controllers: [ProbeGroupsController, ProbeDesignationsController] })
class ProbeModule {}

async function main() {
  const moduleRef = await Test.createTestingModule({
    imports: [ProbeModule],
    providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.init();

  const server = app.getHttpServer();
  // mesmo segredo que o AuthGuard usa, para as requisições autenticadas passarem
  const validToken = jwt.sign({ id: '44444444-4444-4444-8444-444444444444', name: 'Coordenador', profile: 'COORDINATOR' }, process.env.JWT_SECRET || 'tpe-sorocaba', {
    expiresIn: '1h',
  });

  /* ---------------------------------------------------------------- */
  console.log('\nrota registrada? (o handler de probe se identifica pela resposta):');
  const hits: [string, string][] = [
    [`/groups/${GROUP}/designations/week`, 'week'],
    [`/groups/${GROUP}/designations/week-details`, 'week-details'],
    [`/groups/${GROUP}/designations`, 'history'],
    [`/designations/${DESIGNATION}`, 'by-id'],
    [`/designations/${DESIGNATION}/participants`, 'participants'],
    [`/designations/${DESIGNATION}/participants/${PARTICIPANT}`, 'participant'],
  ];
  for (const [path, expectedRoute] of hits) {
    const res = await request(server).get(path).set('Authorization', `Bearer ${validToken}`);
    check(`GET ${path} -> ${expectedRoute}`, res.body?.rota === expectedRoute, `veio ${res.status} ${JSON.stringify(res.body)}`);
  }

  /* ---------------------------------------------------------------- */
  console.log('\nrotas que exigem token:');
  for (const path of [`/groups/${GROUP}/designations/week`, `/groups/${GROUP}/designations/week-details`, `/groups/${GROUP}/designations`, `/designations/${DESIGNATION}`]) {
    const res = await request(server).get(path);
    check(`401 sem token em ${path}`, res.status === 401, `veio ${res.status}`);
  }

  console.log('\nrotas públicas (voluntário pelo link do WhatsApp):');
  {
    const res = await request(server).get(`/designations/${DESIGNATION}/participants`);
    check('sem token: /participants responde 200', res.status === 200, `veio ${res.status}`);
    check('sem token: /participants devolve a rota certa', res.body?.rota === 'participants');

    const res2 = await request(server).get(`/designations/${DESIGNATION}/participants/${PARTICIPANT}`);
    check('sem token: /participants/:participantId responde 200', res2.status === 200, `veio ${res2.status}`);
    check('sem token: recebe os dois ids', res2.body?.id === DESIGNATION && res2.body?.pid === PARTICIPANT);
  }

  console.log('\ntoken inválido não derruba rota pública:');
  {
    const res = await request(server).get(`/designations/${DESIGNATION}/participants`).set('Authorization', 'Bearer nao-e-um-jwt');
    check('200 mesmo com token inválido', res.status === 200, `veio ${res.status}`);
  }

  console.log('\nid inválido (não é UUID):');
  {
    const semToken = await request(server).get(`/groups/abc/designations/week`);
    check('sem token o guard responde 401 antes do ParseUUIDPipe', semToken.status === 401, `veio ${semToken.status}`);
    const comToken = await request(server).get(`/groups/abc/designations/week`).set('Authorization', `Bearer ${validToken}`);
    check('400 em groupId não-uuid (com token)', comToken.status === 400, `veio ${comToken.status}`);
    const res2 = await request(server).get(`/designations/${DESIGNATION}/participants/nao-uuid`);
    check('participantId não-uuid passa (o id vai no where, não em coluna uuid)', res2.status === 200, `veio ${res2.status}`);
  }

  /* ---------------------------------------------------------------- */
  console.log('\nescrita de designação (Fase 4): registro, auth e validação');

  const auth = { Authorization: `Bearer ${validToken}` };
  const writes: [string, 'post' | 'patch' | 'put', string, any?][] = [
    ['/designations', 'post', 'create', { groupId: GROUP }],
    [`/designations/${DESIGNATION}/cancel`, 'patch', 'cancel', { justification: 'chuva' }],
    [`/designations/${DESIGNATION}/reopen`, 'patch', 'reopen', undefined],
    [`/designations/${DESIGNATION}/points/${POINT}`, 'patch', 'point-status', { status: false }],
    [`/designations/${DESIGNATION}/optional`, 'patch', 'optional', { optional: true }],
    [`/designations/${DESIGNATION}/points/${POINT}/participants`, 'put', 'point-participants', { participants: [PARTICIPANT] }],
    [`/designations/${DESIGNATION}/send`, 'post', 'send', { optional: true }],
  ];

  for (const [path, method, expected, body] of writes) {
    const req = (request(server) as any)[method](path).set(auth);
    const res = method === 'post' && path === '/designations' ? await req.query(body) : await req.send(body);
    check(`${method.toUpperCase()} ${path} -> ${expected}`, res.body?.rota === expected, `veio ${res.status} ${JSON.stringify(res.body)}`);
  }

  console.log('\nescrita exige token:');
  for (const [path, method, , body] of writes) {
    const res = await (request(server) as any)[method](path).send(body);
    check(`401 sem token em ${method.toUpperCase()} ${path}`, res.status === 401, `veio ${res.status}`);
  }

  console.log('\nsend aceita corpo vazio (a legacy fazia JSON.parse(_event.body || "{}")):');
  {
    const res = await request(server).post(`/designations/${DESIGNATION}/send`).set(auth).send({});
    check('send sem "optional" -> 200', res.status === 200, `veio ${res.status} ${JSON.stringify(res.body)}`);
    check('optional chega undefined', res.body?.dto?.optional === undefined, JSON.stringify(res.body?.dto));
    const res2 = await request(server).post(`/designations/${DESIGNATION}/send`).set(auth).send({ optional: true });
    check('optional:true chega no service', res2.body?.dto?.optional === true, JSON.stringify(res2.body?.dto));
  }

  console.log('\nPOST /designations responde 200 (paridade com ResponseHandler da legacy):');
  {
    const res = await request(server).post('/designations').set(auth).query({ groupId: GROUP });
    check('status 200, não 201', res.status === 200, `veio ${res.status} ${JSON.stringify(res.body)}`);
  }

  console.log('\nvalidação dos bodies (as mensagens são as da legacy):');
  {
    const cases: [string, string, any, string][] = [
      ['/designations', 'post', {}, 'groupId'],
      ['/designations', 'post', { groupId: '' }, 'groupId'],
      [`/designations/${DESIGNATION}/cancel`, 'patch', {}, 'justification'],
      [`/designations/${DESIGNATION}/cancel`, 'patch', { justification: '' }, 'justification'],
      [`/designations/${DESIGNATION}/points/${POINT}`, 'patch', {}, 'status'],
      [`/designations/${DESIGNATION}/points/${POINT}`, 'patch', { status: 'sim' }, 'status'],
      [`/designations/${DESIGNATION}/optional`, 'patch', {}, 'optional'],
      [`/designations/${DESIGNATION}/optional`, 'patch', { optional: 'sim' }, 'optional'],
      [`/designations/${DESIGNATION}/points/${POINT}/participants`, 'put', {}, 'participants'],
      [`/designations/${DESIGNATION}/points/${POINT}/participants`, 'put', { participants: 'p1' }, 'participants'],
      [`/designations/${DESIGNATION}/points/${POINT}/participants`, 'put', { participants: [1] }, 'participants'],
    ];
    for (const [path, method, body, field] of cases) {
      const req = (request(server) as any)[method](path).set(auth);
      const res = method === 'post' && path === '/designations' ? await req.query(body) : await req.send(body);
      const msg = JSON.stringify(res.body?.message ?? '');
      check(`${method.toUpperCase()} ${path} sem "${field}" -> 400`, res.status === 400, `veio ${res.status} ${msg}`);
    }
  }

  console.log('\n"false" é aceito onde a legacy aceitava (desligar ponto / marcar opcional):');
  {
    const r1 = await request(server).patch(`/designations/${DESIGNATION}/points/${POINT}`).set(auth).send({ status: false });
    check('status=false passa', r1.status === 200, `veio ${r1.status} ${JSON.stringify(r1.body)}`);
    const r2 = await request(server).patch(`/designations/${DESIGNATION}/optional`).set(auth).send({ optional: false });
    check('optional=false passa', r2.status === 200, `veio ${r2.status} ${JSON.stringify(r2.body)}`);
    const r3 = await request(server).put(`/designations/${DESIGNATION}/points/${POINT}/participants`).set(auth).send({ participants: [] });
    check('participants=[] passa (esvaziar ponto)', r3.status === 200, `veio ${r3.status} ${JSON.stringify(r3.body)}`);
  }

  console.log('\nfilter opcional e cru (o front manda encodeURIComponent, a legacy não decodificava):');
  {
    const res = await request(server)
      .put(`/designations/${DESIGNATION}/points/${POINT}/participants`)
      .set(auth)
      .send({ participants: [PARTICIPANT], filter: 'Jo%C3%A3o' });
    check('filter chega cru no service', res.body?.dto?.filter === 'Jo%C3%A3o', JSON.stringify(res.body?.dto));
  }

  await app.close();

  /* ---------------------------------------------------------------- */
  console.log('\nvalidação de data do histórico:');
  const view = new DesignationViewService(null as any);
  for (const [from, to, shouldThrow] of [
    [undefined, undefined, true],
    ['2026-01-01', undefined, true],
    [undefined, '2026-01-31', true],
    ['2026-01-01', 'abc', true],
    ['2026-13-45', '2026-01-31', true],
    ['2026-1-5', '2026-1-31', false], // dayjs aceitava; o front manda yyyy-MM-dd
    ['2026-01-01', '2026-01-31', false],
  ] as [string | undefined, string | undefined, boolean][]) {
    let threw = false;
    try {
      // findHistory valida ANTES de tocar no prisma; com prisma nulo chega lá só se passar.
      await view.findHistory(GROUP, from, to);
    } catch (e: any) {
      threw = e?.constructor?.name === 'BadRequestException' || e?.getStatus?.() === 400;
    }
    check(`dateFrom=${from} dateTo=${to} -> ${shouldThrow ? '400' : 'passa'}`, threw === shouldThrow);
  }

  /* ---------------------------------------------------------------- */
  console.log('\ncontrollers reais: metadados de rota');
  const realDesignations = Reflect.getMetadata('path', DesignationsController);
  const realGroups = Reflect.getMetadata('path', GroupsDesignationsController);
  check('DesignationsController em /designations', realDesignations === 'designations');
  check('GroupsDesignationsController em /groups', realGroups === 'groups');

  const proto = DesignationsController.prototype as any;
  const isPublic = (m: string) => Reflect.getMetadata(IS_PUBLIC_KEY, proto[m]) === true;
  check('findOne exige token', !isPublic('findOne'));
  check('participants é @Public()', isPublic('participants'));
  check('participantDesignation é @Public()', isPublic('participantDesignation'));
  check('remove exige token', !isPublic('remove'));
  check('create exige token', !isPublic('create'));
  check('cancel exige token', !isPublic('cancel'));
  check('reopen exige token', !isPublic('reopen'));
  check('updatePointStatus exige token', !isPublic('updatePointStatus'));
  check('setMandatoryPresence exige token', !isPublic('setMandatoryPresence'));
  check('updatePointParticipants exige token', !isPublic('updatePointParticipants'));
  check('send exige token', !isPublic('send'));
  void DesignationsService;

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
