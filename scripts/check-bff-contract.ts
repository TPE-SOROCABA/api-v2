/** Controllers reais + serviços de auth/lote, com banco e filas em memória.
 * Executar: npx ts-node -T -r tsconfig-paths/register scripts/check-bff-contract.ts
 * Não importa AppModule, não lê .env e não acessa AWS/banco real.
 */
import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { sign, verify } from 'jsonwebtoken';
import { AuthGuard } from '../src/auth/auth.guard';
import { RolesGuard } from '../src/shared/roles.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { LoginUtils } from '../src/modules/auth/login.utils';
import { DesignationsController } from '../src/modules/designations/designations.controller';
import { GroupsDesignationsController } from '../src/modules/designations/groups-designations.controller';
import { DesignationsService } from '../src/modules/designations/designations.service';
import { DesignationViewService } from '../src/modules/designations/designation-view.service';
import { DesignationWriteService } from '../src/modules/designations/designation-write.service';
import { toDesignationView } from '../src/modules/designations/designation-view.mapper';
import { DesignationIncidentsController } from '../src/modules/incidents/designation-incidents.controller';
import { IncidentsService } from '../src/modules/incidents/incidents.service';

const D = '11111111-1111-4111-8111-111111111111';
const G = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333';
const PT = '44444444-4444-4444-8444-444444444444';
const I = '55555555-5555-4555-8555-555555555555';
let checks = 0;
function check(name: string, value: unknown) {
  assert.ok(value, name);
  checks++;
  console.log(`ok ${name}`);
}

async function httpContracts() {
  const authRow = { password: LoginUtils.encryptPassword('teste123'), loginAttempts: 0, resetPasswordCode: '123456', expiredAt: new Date(Date.now() + 300000) };
  const participant = { id: P, name: 'Teste', phone: '11999999999', cpf: '', profilePhoto: null, profile: 'COORDINATOR', participantsGroup: [], auth: authRow };
  const queued: unknown[] = [];
  const db = {
    participants: { findUnique: async ({ where }: any) => (where.phone === participant.phone ? participant : null) },
    auth: {
      update: async ({ data }: any) => {
        Object.assign(authRow, data);
        return authRow;
      },
    },
  };
  const auth = new AuthService(db as any, { dispatch: async (m: unknown) => queued.push(m) } as any);
  const probe =
    (route: string) =>
    (...args: unknown[]) => ({ route, args });
  const write = Object.fromEntries(
    ['create', 'cancel', 'reopen', 'updatePointStatus', 'setMandatoryPresence', 'updateParticipants', 'updateManyParticipants', 'send', 'randomize'].map((name) => [
      name,
      probe(name),
    ]),
  );
  const view = Object.fromEntries(
    ['findById', 'findEventEntries', 'findParticipantEventEntry', 'findByGroupId', 'findWeekDetails', 'findHistory'].map((name) => [name, probe(name)]),
  );
  const module = await Test.createTestingModule({
    controllers: [AuthController, DesignationsController, GroupsDesignationsController, DesignationIncidentsController],
    providers: [
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: PrismaService, useValue: { participants: { findUnique: async ({ where }: any) => ({ profile: where.id === P ? 'COORDINATOR' : 'PARTICIPANT' }) } } },
      { provide: AuthService, useValue: auth },
      { provide: DesignationsService, useValue: { remove: probe('removeDesignation') } },
      { provide: DesignationViewService, useValue: view },
      { provide: DesignationWriteService, useValue: write },
      { provide: IncidentsService, useValue: { create: probe('createIncident'), update: probe('updateIncident'), remove: probe('removeIncident') } },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  try {
    const http = request(app.getHttpServer());
    const login = await http.post('/auth/login').send({ phone: participant.phone, password: 'teste123' });
    check('login público retorna token de sessão', login.status === 200 && !!login.body.token);
    const code = await http.post('/auth/login-code').send({ phone: participant.phone, code: '123456' });
    check('login-code mantém id no JWT', code.status === 200 && (verify(code.body.token, process.env.JWT_SECRET || 'tpe-sorocaba') as any).id === P);
    const recoveryToken = code.body.token;
    const other = sign({ id: G, profile: 'COORDINATOR' }, process.env.JWT_SECRET || 'tpe-sorocaba');
    const resetOther = await http.post('/auth/reset-password').set('Authorization', `Bearer ${other}`).send({ phone: participant.phone, password: 'outra123' });
    check('não pode redefinir senha de outro participante', resetOther.status === 401 && authRow.password === LoginUtils.encryptPassword('teste123'));
    check('reset exige token', (await http.post('/auth/reset-password').send({ phone: participant.phone, password: 'nova123' })).status === 401);
    const reset = await http.post('/auth/reset-password').set('Authorization', `Bearer ${recoveryToken}`).send({ phone: participant.phone, password: 'nova123' });
    check('token real do login-code redefine a senha do titular', reset.status === 200 && authRow.resetPasswordCode === null);
    const relogin = await http.post('/auth/login').send({ phone: participant.phone, password: 'nova123' });
    check('login após redefinição funciona', relogin.status === 200 && !!relogin.body.token);
    const recover = await http.post('/auth/recover-password').send({ phone: participant.phone });
    check('recuperação publica OTP no adaptador da fila', recover.status === 200 && queued.length === 1 && /^\d{6}$/.test(authRow.resetPasswordCode!));
    check('código incorreto é rejeitado', (await http.post('/auth/login-code').send({ phone: participant.phone, code: '000000' })).status === 400);
    authRow.expiredAt = new Date(0);
    check('código expirado é rejeitado', (await http.post('/auth/login-code').send({ phone: participant.phone, code: authRow.resetPasswordCode })).status === 400);

    const token = relogin.body.token;
    const forbiddenCreate = await http.post(`/designations?groupId=${G}`).set('Authorization', `Bearer ${other}`).send({});
    check('criação exige coordenador atual no banco, não apenas no JWT', forbiddenCreate.status === 403);
    const routes: [string, string, object | undefined, string, boolean][] = [
      ['get', `/designations/${D}`, undefined, 'findById', false],
      ['delete', `/designations/${D}`, undefined, 'removeDesignation', false],
      ['get', `/designations/${D}/participants`, undefined, 'findEventEntries', true],
      ['get', `/designations/${D}/participants/${P}`, undefined, 'findParticipantEventEntry', true],
      ['get', `/groups/${G}/designations/week?groupId=${G}&filter=Teste`, undefined, 'findByGroupId', false],
      ['get', `/groups/${G}/designations/week?random=true`, undefined, 'randomize', false],
      ['get', `/groups/${G}/designations/week-details`, undefined, 'findWeekDetails', false],
      ['get', `/groups/${G}/designations?dateFrom=2026-01-01&dateTo=2026-01-31`, undefined, 'findHistory', false],
      ['post', `/designations?groupId=${G}`, {}, 'create', false],
      ['patch', `/designations/${D}/cancel`, { justification: 'Chuva' }, 'cancel', false],
      ['patch', `/designations/${D}/reopen`, {}, 'reopen', false],
      ['patch', `/designations/${D}/points/${PT}`, { status: false }, 'updatePointStatus', false],
      ['patch', `/designations/${D}/optional`, { optional: true }, 'setMandatoryPresence', false],
      ['put', `/designations/${D}/points/${PT}/participants`, { participants: [P] }, 'updateParticipants', false],
      ['put', `/designations/${D}/participants`, { assignments: [{ pointId: PT, participantIds: [P] }] }, 'updateManyParticipants', false],
      ['post', `/designations/${D}/send`, { optional: true }, 'send', false],
      ['post', `/designations/${D}/send`, { optional: 'ignorar' }, 'send', false],
      ['post', `/designations/${D}/participants/${P}/incidences`, { reason: 'Ausência' }, 'createIncident', true],
      ['put', `/designations/${D}/participants/${P}/incidences/${I}`, { reason: 'Atualizada' }, 'updateIncident', true],
      ['delete', `/designations/${D}/participants/${P}/incidences/${I}`, undefined, 'removeIncident', false],
    ];
    for (const [method, url, body, route, isPublic] of routes) {
      const hit = await (http as any)[method](url).set('Authorization', `Bearer ${token}`).send(body);
      check(`${method.toUpperCase()} ${url} usa controller real`, hit.status === 200 && hit.body.route === route);
      const anonymous = await (http as any)[method](url).send(body);
      check(`${route}: acesso ${isPublic ? 'público' : 'autenticado'}`, anonymous.status === (isPublic ? 200 : 401));
    }
    for (const body of [{ assignments: [] }, { assignments: [{ pointId: PT, participantIds: [123] }] }, { assignments: [{}] }]) {
      const result = await http.put(`/designations/${D}/participants`).set('Authorization', `Bearer ${token}`).send(body);
      check('lote inválido rejeitado por DTO real', result.status === 400);
    }
  } finally {
    await app.close();
  }
}

function fixture() {
  const members = ['p1', 'p2', 'p3', 'blocked'].map((id) => ({
    id,
    name: id,
    cpf: null,
    phone: '000',
    profilePhoto: null,
    sex: 'MALE',
    incidentParticipant: id === 'blocked' ? [{ id: I, designationId: D, reason: 'Ausência', status: 'OPEN' }] : [],
    participantsGroup: [{ id: `pg-${id}`, groupId: G, participantId: id, profile: 'PARTICIPANT' }],
  }));
  return {
    id: D,
    groupId: G,
    status: 'OPEN',
    createdAt: new Date(),
    updatedAt: new Date(),
    mandatoryPresence: true,
    group: {
      id: G,
      name: 'Teste',
      type: 'MAIN',
      whatsappId: null,
      configWeekday: 'MONDAY',
      configStartHour: '19:00',
      configEndHour: '21:00',
      configMin: 2,
      configMax: 4,
      participantsGroup: members.map((participant) => ({ id: `pg-${participant.id}`, participantId: participant.id, profile: 'PARTICIPANT', participant })),
    },
    assignments: ['a1', 'a2', 'a3'].map((id, index) => ({
      id,
      pointId: id,
      point: { id, name: id },
      config_status: true,
      config_min: 2,
      config_max: 4,
      assignmentsPublicationCart: [],
      assignmentsParticipants: index === 2 ? [{ id: 'link', assignmentId: id, participantId: 'p1', participant: members[0] }] : [],
    })),
  };
}

async function batchContracts() {
  let model = fixture();
  let loads = 0;
  let transactions = 0;
  let operations: any[] = [];
  const db = {
    designations: {
      findUnique: async () => {
        loads++;
        return model;
      },
      update: (args: unknown) => ({ op: 'update', args }),
    },
    assignmentsParticipants: {
      deleteMany: (args: unknown) => ({ op: 'delete', args }),
      createMany: (args: unknown) => ({ op: 'create', args }),
    },
    $transaction: async (ops: any[]) => {
      transactions++;
      operations = ops;
    },
  };
  const service = new DesignationWriteService(db as any, {} as any, {} as any, {} as any, {} as any);
  const view = await service.updateManyParticipants(D, {
    assignments: [
      { pointId: 'a1', participantIds: ['p1', 'p2', 'blocked', 'unknown'] },
      { pointId: 'a2', participantIds: ['p2', 'p3'] },
    ],
  });
  check('lote faz uma leitura e uma transação', loads === 1 && transactions === 1);
  check('lote filtra faltas abertas e ids fora do grupo', !view.assignments.some((a) => a.participants.some((p) => p.id === 'blocked' || p.id === 'unknown')));
  check(
    'último ponto ganha participante repetido',
    view.assignments
      .find((a) => a.id === 'a1')!
      .participants.map((p) => p.id)
      .join() === 'p1',
  );
  check('move participante de ponto não incluído no lote', view.assignments.find((a) => a.id === 'a3')!.participants.length === 0);
  check(
    'limpeza fora do lote restringe apenas participantes movidos',
    operations[1].args.where.assignmentId.notIn.join() === 'a1,a2' && operations[1].args.where.participantId.in.includes('p1'),
  );
  check('grava apenas pontos solicitados', operations[2].args.data.length === 3 && operations[2].args.data.every((r: any) => r.assignmentId !== 'a3'));

  // O resultado deve ser equivalente ao loop dos endpoints unitários.
  model = fixture();
  await service.updateParticipants(D, 'a1', { participants: ['p1', 'p2', 'blocked', 'unknown'] });
  const sequential = await service.updateParticipants(D, 'a2', { participants: ['p2', 'p3'] });
  const ids = (v: any) => v.assignments.map((a: any) => [a.id, a.participants.map((p: any) => p.id).sort()]).sort();
  check('lote equivale às chamadas unitárias em sequência', JSON.stringify(ids(view)) === JSON.stringify(ids(sequential)));
  const before = transactions;
  model = fixture();
  await assert.rejects(
    service.updateManyParticipants(D, {
      assignments: [
        { pointId: 'a1', participantIds: ['p1'] },
        { pointId: 'não-existe', participantIds: [] },
      ],
    }),
  );
  check('ponto inexistente não grava parcialmente', transactions === before);
  model.status = 'CANCELLED';
  await assert.rejects(service.updateManyParticipants(D, { assignments: [{ pointId: 'a1', participantIds: [] }] }));
  check('lote não edita designação cancelada', transactions === before);
  model = fixture();
  await service.updateManyParticipants(D, { assignments: [{ pointId: 'a3', participantIds: [] }] });
  check('lote aceita esvaziar ponto', toDesignationView(model as any).assignments.find((a) => a.id === 'a3')!.participants.length === 0);
}

async function main() {
  await httpContracts();
  await batchContracts();
  console.log(`\n${checks} verificações do BFF passaram (sem banco/AWS reais).`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
