/**
 * Paridade do `POST /designations/:id/send` (Fase 5).
 *
 * Compara a implementação nova com a da legacy COPIADA aqui
 * (`SendAssignmentDesignation` + `ParticipantsNotAssignment`), exercitando o
 * `DesignationWriteService` real com dependências falsas.
 *
 * Roda com:
 *   npx ts-node -T -r tsconfig-paths/register scripts/check-designation-send-parity.ts
 */
import { DesignationStatus } from '@prisma/client';

import { DesignationWriteService } from 'src/modules/designations/designation-write.service';
import { toDesignationView } from 'src/modules/designations/designation-view.mapper';

const ID = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' };
const P = (n: number) => `p${n}`;

// ----------------------------------------------------------------------------------------
// legacy copiada
// ----------------------------------------------------------------------------------------

interface LegacyParticipant {
  id: string;
  name: string;
  phone: string;
  profile?: string;
  incident: unknown;
}
interface LegacyAssignment {
  id: string;
  pointName: string;
  participants: LegacyParticipant[];
}
interface LegacyDesignation {
  group: { name: string; whatsappId?: string | null; type: string; config: { weekday: string; startHour: string; endHour: string } };
  status: string;
  assignments: LegacyAssignment[];
  participants: LegacyParticipant[];
}

/** `ParticipantsNotAssignment` — literal. */
function legacyParticipantsNotAssignment(d: LegacyDesignation) {
  d.participants.forEach((participant) => {
    if (participant.incident) return;
    if (participant.profile === 'CAPTAIN') return;
    if (participant.profile === 'ASSISTANT_CAPTAIN') return;
    if (participant.profile === 'COORDINATOR') return;
    if (participant.profile === 'ASSISTANT_COORDINATOR') return;
    if (participant.profile === 'ADMIN_ANALYST') return;
    if (d.group.type === 'SPECIAL') return;
    throw new Error('Não pode haver participantes sem atribuição');
  });
}

// ----------------------------------------------------------------------------------------
// fixture
// ----------------------------------------------------------------------------------------

function buildModel(opts: {
  groupType?: 'MAIN' | 'ADDITIONAL' | 'SPECIAL';
  whatsappId?: string | null;
  status?: DesignationStatus;
  /** [id, cargo no grupo] */
  unassigned: [string, string][];
  /** ponto -> participantes escalados */
  assignments: { pointId: string; participants: [string, string][] }[];
}) {
  const phone = (id: string) => `5511${id.slice(1).padStart(8, '0')}`;
  return {
    id: ID.A,
    groupId: ID.B,
    status: opts.status ?? DesignationStatus.OPEN,
    mandatoryPresence: true,
    cancellationJustification: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    group: {
      id: ID.B,
      name: 'Grupo Teste',
      whatsappId: opts.whatsappId ?? null,
      type: opts.groupType ?? 'MAIN',
      configWeekday: 'MONDAY',
      configStartHour: '19:00',
      configEndHour: '21:00',
      configMin: 2,
      configMax: 4,
      participantsGroup: opts.unassigned.map(([id, role]) => ({
        participantId: id,
        groupId: ID.B,
        profile: role,
        participant: {
          id,
          name: id,
          cpf: null,
          phone: phone(id),
          profilePhoto: null,
          sex: 'MALE',
          incidentParticipant: [],
        },
      })),
    },
    assignments: opts.assignments.map((a, i) => ({
      id: `a${i + 1}`,
      pointId: a.pointId,
      designationsId: ID.A,
      config_min: 2,
      config_max: 4,
      config_status: true,
      point: { id: a.pointId, name: `Ponto ${a.pointId}` },
      assignmentsPublicationCart: [],
      assignmentsParticipants: a.participants.map(([id, role]) => ({
        participantId: id,
        assignmentId: `a${i + 1}`,
        participant: {
          id,
          name: id,
          cpf: null,
          phone: phone(id),
          profilePhoto: null,
          sex: 'MALE',
          incidentParticipant: [],
          // o cargo do escalado vem de participants_group do grupo da designação
          participantsGroup: [{ groupId: ID.B, profile: role }],
        },
      })),
    })),
  };
}

// ----------------------------------------------------------------------------------------
// harness
// ----------------------------------------------------------------------------------------

type Op = { name: string; args: any };

function makeHarness(model: any) {
  const ops: Op[] = [];
  const dispatched: any[] = [];
  const shortened: string[] = [];

  const prisma: any = {
    designations: {
      update: (args: any) => (ops.push({ name: 'designations.update', args }), Promise.resolve({})),
      findUnique: () => Promise.resolve(model),
    },
    shortLink: {
      findUnique: () => Promise.resolve(null),
      create: (args: any) => (ops.push({ name: 'shortLink.create', args }), Promise.resolve({})),
    },
    assignmentsParticipants: { deleteMany: () => Promise.resolve({ count: 0 }), createMany: () => Promise.resolve({ count: 0 }) },
    assignments: { update: () => Promise.resolve({}) },
    $transaction: (arg: any) => (Array.isArray(arg) ? arg.forEach((p: any) => p) : undefined, Promise.resolve([])),
  };

  const service = new DesignationWriteService(
    prisma,
    { dispatch: async (p: any) => void dispatched.push(p) } as any,
    {
      // devolve a mensagem com os campos visíveis, para comparar o conteúdo
      generate: (_t: any, d: any) => `equipe|${d.details}|${d.generalLink}|${d.loginLink}`,
    } as any,
    {
      shorten: async (url: string) => {
        shortened.push(url);
        return `https://go.tpedigital.com.br/s/c${shortened.length}`;
      },
    } as any,
    { previousArchivedDesignation: async () => null } as any,
  );

  (service as any).load = async () => model;
  (service as any).view = async () => toDesignationView(model);
  return { service, ops, dispatched, shortened };
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const cases: (() => Promise<void>)[] = [];
const run = (fn: () => Promise<void>) => cases.push(fn);

// ----------------------------------------------------------------------------------------
// ParticipantsNotAssignment
// ----------------------------------------------------------------------------------------

console.log('\nParticipantsNotAssignment — quem pode ficar sem ponto\n');

const notAssigned: [string, Parameters<typeof buildModel>[0]][] = [
  ['participante comum sem ponto -> bloqueia', { unassigned: [[P(1), 'PARTICIPANT']], assignments: [] }],
  ['capitão sem ponto -> liberado', { unassigned: [[P(1), 'CAPTAIN']], assignments: [] }],
  ['assistente sem ponto -> liberado', { unassigned: [[P(1), 'ASSISTANT_CAPTAIN']], assignments: [] }],
  ['todos escalados -> liberado', { unassigned: [[P(1), 'PARTICIPANT']], assignments: [{ pointId: 'pt1', participants: [[P(1), 'PARTICIPANT']] }] }],
  ['capitão escalado + comum sem ponto -> bloqueia', { unassigned: [[P(2), 'PARTICIPANT']], assignments: [{ pointId: 'pt1', participants: [[P(1), 'CAPTAIN']] }] }],
  ['grupo ESPECIAL com comum sem ponto -> liberado', { groupType: 'SPECIAL', unassigned: [[P(1), 'PARTICIPANT']], assignments: [] }],
];

for (const [name, opts] of notAssigned) {
  const model = buildModel(opts);
  const domain: LegacyDesignation = {
    group: {
      name: model.group.name,
      whatsappId: model.group.whatsappId,
      type: model.group.type,
      config: { weekday: 'MONDAY', startHour: '19:00', endHour: '21:00' },
    },
    status: 'OPEN',
    participants: (model.group.participantsGroup as any[]).map((pg) => ({ id: pg.participantId, name: pg.participantId, phone: 'x', profile: pg.profile, incident: null })),
    assignments: (model.assignments as any[]).map((a) => ({
      id: a.id,
      pointName: `Ponto ${a.pointId}`,
      participants: a.assignmentsParticipants.map((ap: any) => ({ id: ap.participantId, name: ap.participantId, phone: 'x', incident: null })),
    })),
  };
  // `DesignationMapper.toDomain` tira da lista de disponíveis quem já está
  // escalado (o splice do mapper). Sem isso o simulado acusaria gente escalada.
  const scaled = new Set(domain.assignments.flatMap((a) => a.participants.map((p) => p.id)));
  domain.participants = domain.participants.filter((p) => !scaled.has(p.id));

  let legacyThrew = false;
  try {
    legacyParticipantsNotAssignment(domain);
  } catch (e: any) {
    legacyThrew = e.message === 'Não pode haver participantes sem atribuição';
  }

  run(async () => {
    const { service } = makeHarness(buildModel(opts));
    let apiThrew = false;
    try {
      await service.send(ID.A, {});
    } catch (e: any) {
      apiThrew = e?.message === 'Não pode haver participantes sem atribuição';
    }
    check(name, legacyThrew === apiThrew, `legacy bloqueia=${legacyThrew} api-v2 bloqueia=${apiThrew}`);
  });
}

// ----------------------------------------------------------------------------------------
// ordem: validação ANTES do status
// ----------------------------------------------------------------------------------------

console.log('\nordem da validação (a legacy valida antes de checar o status)\n');

run(async () => {
  // designação em andamento + participante sem ponto: a legacy acusa o
  // participante, não o status.
  const model = buildModel({ status: DesignationStatus.IN_PROGRESS, unassigned: [[P(1), 'PARTICIPANT']], assignments: [] });
  const { service } = makeHarness(model);
  let msg = '';
  try {
    await service.send(ID.A, {});
  } catch (e: any) {
    msg = e?.message ?? '';
  }
  check('IN_PROGRESS + sem atribuição acusa a atribuição primeiro', msg === 'Não pode haver participantes sem atribuição', msg);
});

run(async () => {
  // em andamento e todo mundo escalado: aí sim é o status
  const model = buildModel({ status: DesignationStatus.IN_PROGRESS, unassigned: [], assignments: [{ pointId: 'pt1', participants: [[P(1), 'PARTICIPANT']] }] });
  const { service } = makeHarness(model);
  let msg = '';
  try {
    await service.send(ID.A, {});
  } catch (e: any) {
    msg = e?.message ?? '';
  }
  check('IN_PROGRESS com tudo escalado acusa o status', msg === 'Designação não pode ser enviada, pois está em andamento', msg);
});

run(async () => {
  const model = buildModel({ status: DesignationStatus.CANCELLED, unassigned: [], assignments: [{ pointId: 'pt1', participants: [[P(1), 'PARTICIPANT']] }] });
  const { service } = makeHarness(model);
  let msg = '';
  try {
    await service.send(ID.A, {});
  } catch (e: any) {
    msg = e?.message ?? '';
  }
  check('CANCELLED acusa "cancelada"', msg === 'Designação não pode ser enviada, pois está cancelada', msg);
});

// ----------------------------------------------------------------------------------------
// destinatários e payload
// ----------------------------------------------------------------------------------------

console.log('\ndestinatários do WhatsApp\n');

run(async () => {
  const model = buildModel({ whatsappId: '5511999999999', unassigned: [[P(1), 'CAPTAIN']], assignments: [] });
  const { service, dispatched } = makeHarness(model);
  await service.send(ID.A, {});
  check('grupo com whatsappId avisa SÓ ele', dispatched.length === 1 && dispatched[0].phone === '5511999999999', JSON.stringify(dispatched.map((d) => d.phone)));
});

run(async () => {
  const model = buildModel({
    whatsappId: null,
    unassigned: [[P(1), 'CAPTAIN']],
    assignments: [
      {
        pointId: 'pt1',
        participants: [
          [P(3), 'CAPTAIN'],
          [P(4), 'PARTICIPANT'],
        ],
      },
    ],
  });
  const { service, dispatched } = makeHarness(model);
  await service.send(ID.A, {});
  check('sem whatsappId avisa os capitães, escalados ou não', dispatched.length === 2, JSON.stringify(dispatched.map((d) => d.phone)));
  check('telefones são únicos', new Set(dispatched.map((d) => d.phone)).size === dispatched.length);
});

run(async () => {
  const model = buildModel({
    whatsappId: null,
    unassigned: [
      [P(1), 'PARTICIPANT'],
      [P(2), 'PARTICIPANT'],
    ],
    assignments: [
      {
        pointId: 'pt1',
        participants: [
          [P(1), 'PARTICIPANT'],
          [P(2), 'PARTICIPANT'],
        ],
      },
    ],
  });
  const { service, dispatched, ops } = makeHarness(model);
  await service.send(ID.A, {});
  check(
    'sem capitão e sem whatsappId: não despacha, mas ainda envia a designação',
    dispatched.length === 0 && ops.some((o) => o.name === 'designations.update'),
    JSON.stringify(dispatched),
  );
});

// ----------------------------------------------------------------------------------------
// links e payload
// ----------------------------------------------------------------------------------------

console.log('\nlinks curtos e payload\n');

run(async () => {
  process.env.SHORT_LINK_DOMAIN = 'https://go.tpedigital.com.br';
  const model = buildModel({ whatsappId: '5511999999999', unassigned: [[P(1), 'CAPTAIN']], assignments: [] });
  const { service, dispatched, shortened } = makeHarness(model);
  await service.send(ID.A, {});
  check('dois links encurtados por envio', shortened.length === 2, JSON.stringify(shortened));
  check('link geral vai para o front', shortened[0] === 'https://app.tpedigital.com.br/designacao/' + ID.A, shortened[0]);
  check('link meu aponta para a LEGACY /public/start', shortened[1]?.endsWith(`/public/start/${ID.A}`), shortened[1]);
  check(
    'payload com title/footer de texto',
    dispatched[0]?.type === 'text' && dispatched[0]?.footer === 'TPE Digital' && /^Grupo Teste - Designação$/.test(dispatched[0]?.title ?? ''),
    JSON.stringify(dispatched[0]),
  );
  check('a mensagem embute os dois links', (dispatched[0]?.message ?? '').includes('/s/c1') && (dispatched[0]?.message ?? '').includes('/s/c2'), dispatched[0]?.message);
});

// ----------------------------------------------------------------------------------------
// persistência
// ----------------------------------------------------------------------------------------

console.log('\npersistência\n');

run(async () => {
  const model = buildModel({ whatsappId: '5511999999999', unassigned: [[P(1), 'CAPTAIN']], assignments: [] });
  const { service, ops } = makeHarness(model);
  await service.send(ID.A, { optional: true });
  const upd = ops.find((o) => o.name === 'designations.update')?.args.data;
  check('manda para IN_PROGRESS', upd?.status === DesignationStatus.IN_PROGRESS, JSON.stringify(upd));
  check('optional:true -> mandatoryPresence=false', upd?.mandatoryPresence === false, JSON.stringify(upd));
});

run(async () => {
  const model = buildModel({ whatsappId: '5511999999999', unassigned: [[P(1), 'CAPTAIN']], assignments: [] });
  const { service, ops } = makeHarness(model);
  await service.send(ID.A, {});
  const upd = ops.find((o) => o.name === 'designations.update')?.args.data;
  check('sem "optional" no body, mandatoryPresence não é tocado', !('mandatoryPresence' in (upd ?? {})), JSON.stringify(upd));
});

run(async () => {
  const model = buildModel({ whatsappId: '5511999999999', unassigned: [[P(1), 'CAPTAIN']], assignments: [] });
  const { service, ops } = makeHarness(model);
  await service.send(ID.A, { optional: false } as any);
  const upd = ops.find((o) => o.name === 'designations.update')?.args.data;
  check('optional:false -> mandatoryPresence=true', upd?.mandatoryPresence === true, JSON.stringify(upd));
});

async function main() {
  for (const fn of cases) await fn();
  console.log(`\n${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail ? 1 : 0);
}
main();
